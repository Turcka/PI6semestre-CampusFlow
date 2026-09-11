-- =============================================================================
-- 0003_tenancy.sql
-- Modelo multi-tenant (RNF-04): tenants, campi, perfis, cursos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Função utilitária: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- tenants: uma instituição de ensino = um tenant
-- -----------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  timezone    text not null default 'America/Sao_Paulo',
  logo_url    text,
  settings    jsonb not null default '{
    "default_visit_duration_minutes": 60,
    "min_booking_notice_hours": 24,
    "max_booking_window_days": 60,
    "no_show_grace_minutes": 30,
    "lead_retention_months": 24
  }'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create trigger trg_tenants_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- campuses
-- -----------------------------------------------------------------------------
create table public.campuses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  slug        text not null,
  address     text,
  city        text,
  state       text,
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  map_bounds  jsonb, -- {"south":-23.6,"west":-46.6,"north":-23.5,"east":-46.5}
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint campuses_tenant_slug_unique unique (tenant_id, slug),
  constraint campuses_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create index campuses_tenant_idx on public.campuses (tenant_id);

create trigger trg_campuses_updated_at
before update on public.campuses
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- profiles: espelho de auth.users com tenant e papel
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  phone       text,
  role        public.user_role not null default 'secretaria',
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_tenant_idx on public.profiles (tenant_id);
create index profiles_tenant_role_idx on public.profiles (tenant_id, role) where is_active;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Cria o profile automaticamente quando um usuário é convidado/criado no Auth
-- com user_metadata { tenant_id, role, full_name }.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_role      public.user_role;
begin
  v_tenant_id := nullif(new.raw_user_meta_data ->> 'tenant_id', '')::uuid;
  if v_tenant_id is null then
    -- Usuário sem tenant: o profile será criado depois pela API
    return new;
  end if;

  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'secretaria');

  insert into public.profiles (id, tenant_id, full_name, email, phone, role)
  values (
    new.id,
    v_tenant_id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Funções de contexto usadas pelas políticas RLS
-- -----------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.has_role(variadic p_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = any(p_roles) from public.profiles where id = auth.uid() and is_active), false);
$$;

-- -----------------------------------------------------------------------------
-- courses e vínculo coordenador <-> curso
-- -----------------------------------------------------------------------------
create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  campus_id   uuid not null references public.campuses(id) on delete cascade,
  name        text not null,
  code        text,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint courses_campus_name_unique unique (campus_id, name)
);

create index courses_tenant_idx on public.courses (tenant_id);
create index courses_campus_idx on public.courses (campus_id) where is_active;

create trigger trg_courses_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

create table public.coordinator_courses (
  coordinator_id uuid not null references public.profiles(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (coordinator_id, course_id)
);

create index coordinator_courses_course_idx on public.coordinator_courses (course_id);
