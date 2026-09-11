-- =============================================================================
-- 0007_map.sql
-- Mapa interativo do campus e check-in via QR Code. Fase 3.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- pois: pontos de interesse
-- -----------------------------------------------------------------------------
create table public.pois (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  campus_id       uuid not null references public.campuses(id) on delete cascade,
  name            text not null,
  category        public.poi_category not null default 'outro',
  description     text,
  latitude        numeric(9,6) not null,
  longitude       numeric(9,6) not null,
  building        text,
  floor           text,
  is_accessible   boolean not null default true,
  order_index     integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pois_lat_range check (latitude between -90 and 90),
  constraint pois_lng_range check (longitude between -180 and 180)
);

create index pois_campus_idx on public.pois (campus_id, order_index) where is_active;
create index pois_tenant_idx on public.pois (tenant_id);

create trigger trg_pois_updated_at
before update on public.pois
for each row execute function public.set_updated_at();

create table public.poi_photos (
  id            uuid primary key default gen_random_uuid(),
  poi_id        uuid not null references public.pois(id) on delete cascade,
  storage_path  text not null, -- bucket poi-photos
  caption       text,
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);

create index poi_photos_poi_idx on public.poi_photos (poi_id, order_index);

-- -----------------------------------------------------------------------------
-- routes: rotas pré-definidas (GeoJSON LineString em geometry)
-- -----------------------------------------------------------------------------
create table public.routes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  campus_id       uuid not null references public.campuses(id) on delete cascade,
  name            text not null,
  description     text,
  is_accessible   boolean not null default false,
  geometry        jsonb, -- {"type":"LineString","coordinates":[[lng,lat],...]}
  distance_meters integer,
  duration_minutes integer,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index routes_campus_idx on public.routes (campus_id) where is_active;

create trigger trg_routes_updated_at
before update on public.routes
for each row execute function public.set_updated_at();

create table public.route_points (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references public.routes(id) on delete cascade,
  poi_id        uuid not null references public.pois(id) on delete cascade,
  order_index   integer not null,
  dwell_minutes integer not null default 10,
  notes         text,
  constraint route_points_unique_order unique (route_id, order_index)
);

create index route_points_poi_idx on public.route_points (poi_id);

-- -----------------------------------------------------------------------------
-- itineraries: roteiro sugerido por curso
-- -----------------------------------------------------------------------------
create table public.itineraries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  course_id   uuid not null unique references public.courses(id) on delete cascade,
  route_id    uuid not null references public.routes(id) on delete cascade,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_itineraries_updated_at
before update on public.itineraries
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- checkins
-- -----------------------------------------------------------------------------
create table public.checkins (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  visit_id    uuid not null unique references public.visits(id) on delete cascade,
  scanned_by  uuid references public.profiles(id) on delete set null,
  scanned_at  timestamptz not null default now(),
  location    jsonb, -- {"latitude":..,"longitude":..}
  notes       text
);

create index checkins_tenant_scanned_idx on public.checkins (tenant_id, scanned_at desc);

-- -----------------------------------------------------------------------------
-- check_in_visit(): valida token e janela de horário, marca a visita
-- -----------------------------------------------------------------------------
create or replace function public.check_in_visit(
  p_token      uuid,
  p_scanned_by uuid default auth.uid(),
  p_location   jsonb default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits%rowtype;
  v_grace interval := interval '60 minutes';
begin
  select * into v_visit from public.visits where checkin_token = p_token for update;
  if not found then
    raise exception 'CHECKIN_TOKEN_INVALID' using errcode = 'P0002';
  end if;

  if v_visit.status = 'checked_in' then
    return v_visit; -- idempotente
  end if;

  if v_visit.status not in ('confirmed', 'pending_confirmation') then
    raise exception 'VISIT_NOT_CHECKABLE' using errcode = 'P0001', hint = 'Visita cancelada ou expirada.';
  end if;

  if now() < lower(v_visit.period) - v_grace or now() > upper(v_visit.period) + v_grace then
    raise exception 'CHECKIN_OUT_OF_WINDOW' using errcode = 'P0001', hint = 'Fora da janela de check-in.';
  end if;

  update public.visits
  set status = 'checked_in', checked_in_at = now()
  where id = v_visit.id
  returning * into v_visit;

  insert into public.checkins (tenant_id, visit_id, scanned_by, location)
  values (v_visit.tenant_id, v_visit.id, p_scanned_by, p_location)
  on conflict (visit_id) do nothing;

  return v_visit;
end;
$$;

-- -----------------------------------------------------------------------------
-- Payload público do mapa (consumido pela API e cacheado offline no PWA)
-- -----------------------------------------------------------------------------
create or replace view public.vw_public_campus_map as
select
  c.id as campus_id,
  c.tenant_id,
  c.slug,
  c.name,
  c.latitude,
  c.longitude,
  c.map_bounds,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'category', p.category,
      'description', p.description,
      'latitude', p.latitude,
      'longitude', p.longitude,
      'building', p.building,
      'floor', p.floor,
      'is_accessible', p.is_accessible,
      'photos', coalesce((
        select jsonb_agg(ph.storage_path order by ph.order_index)
        from public.poi_photos ph where ph.poi_id = p.id
      ), '[]'::jsonb)
    ) order by p.order_index, p.name)
    from public.pois p
    where p.campus_id = c.id and p.is_active
  ), '[]'::jsonb) as pois,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'description', r.description,
      'is_accessible', r.is_accessible,
      'geometry', r.geometry,
      'distance_meters', r.distance_meters,
      'duration_minutes', r.duration_minutes,
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('poi_id', rp.poi_id, 'order', rp.order_index, 'dwell_minutes', rp.dwell_minutes) order by rp.order_index)
        from public.route_points rp where rp.route_id = r.id
      ), '[]'::jsonb)
    ) order by r.name)
    from public.routes r
    where r.campus_id = c.id and r.is_active
  ), '[]'::jsonb) as routes
from public.campuses c
where c.is_active;

-- -----------------------------------------------------------------------------
-- Buckets públicos de imagens
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('poi-photos',    'poi-photos',    true, 10485760, array['image/png', 'image/jpeg', 'image/webp']),
  ('tenant-assets', 'tenant-assets', true, 5242880,  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do nothing;
