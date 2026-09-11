-- =============================================================================
-- 0005_scheduling.sql
-- Motor de agendamento anti double-booking. Fase 1 - RF-02, RF-03, RF-04.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- availability_rules: recorrência semanal por coordenador
-- -----------------------------------------------------------------------------
create table public.availability_rules (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  coordinator_id        uuid not null references public.profiles(id) on delete cascade,
  campus_id             uuid not null references public.campuses(id) on delete cascade,
  weekday               smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time            time not null,
  end_time              time not null,
  slot_duration_minutes integer not null default 60 check (slot_duration_minutes between 15 and 240),
  capacity              integer not null default 1 check (capacity between 1 and 200),
  valid_from            date,
  valid_until           date,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint availability_rules_time_order check (start_time < end_time),
  constraint availability_rules_validity check (valid_until is null or valid_from is null or valid_from <= valid_until)
);

create index availability_rules_coordinator_idx on public.availability_rules (coordinator_id) where is_active;
create index availability_rules_tenant_idx on public.availability_rules (tenant_id);

create trigger trg_availability_rules_updated_at
before update on public.availability_rules
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- availability_exceptions: bloqueios pontuais ou liberações extras
-- -----------------------------------------------------------------------------
create table public.availability_exceptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  coordinator_id  uuid not null references public.profiles(id) on delete cascade,
  period          tstzrange not null,
  kind            public.availability_exception_kind not null default 'block',
  reason          text,
  created_at      timestamptz not null default now(),
  constraint availability_exceptions_period_not_empty check (not isempty(period))
);

create index availability_exceptions_coordinator_period_idx
  on public.availability_exceptions using gist (coordinator_id, period);

-- -----------------------------------------------------------------------------
-- visit_slots: janelas materializadas com capacidade
-- Um coordenador nunca tem dois slots sobrepostos (primeira barreira anti
-- double-booking, garantida pela constraint EXCLUDE).
-- -----------------------------------------------------------------------------
create table public.visit_slots (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  campus_id           uuid not null references public.campuses(id) on delete cascade,
  coordinator_id      uuid not null references public.profiles(id) on delete cascade,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  capacity            integer not null default 1 check (capacity between 1 and 200),
  booked_count        integer not null default 0 check (booked_count >= 0),
  is_open             boolean not null default true,
  generated_from_rule uuid references public.availability_rules(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint visit_slots_time_order check (starts_at < ends_at),
  constraint visit_slots_capacity_respected check (booked_count <= capacity),
  constraint visit_slots_coordinator_start_unique unique (coordinator_id, starts_at),
  constraint visit_slots_no_overlap exclude using gist (
    coordinator_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

create index visit_slots_campus_starts_idx on public.visit_slots (campus_id, starts_at) where is_open;
create index visit_slots_coordinator_starts_idx on public.visit_slots (coordinator_id, starts_at);
create index visit_slots_tenant_idx on public.visit_slots (tenant_id);

create trigger trg_visit_slots_updated_at
before update on public.visit_slots
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- visits
-- Segunda barreira: visitas ativas de um coordenador em slots exclusivos
-- (capacidade 1) nunca se sobrepõem. Slots com capacidade > 1 (tours em grupo)
-- têm a exclusividade controlada por booked_count dentro de book_visit().
-- -----------------------------------------------------------------------------
create table public.visits (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete restrict,
  slot_id         uuid not null references public.visit_slots(id) on delete restrict,
  coordinator_id  uuid not null references public.profiles(id) on delete restrict,
  campus_id       uuid not null references public.campuses(id) on delete restrict,
  course_id       uuid references public.courses(id) on delete set null,
  type            public.visit_type not null default 'individual',
  group_size      integer not null default 1 check (group_size between 1 and 200),
  group_name      text, -- nome da escola/caravana em visitas em grupo
  status          public.visit_status not null default 'pending_confirmation',
  period          tstzrange not null,
  is_exclusive    boolean not null default true, -- slot de capacidade 1
  checkin_token   uuid not null unique default gen_random_uuid(),
  checked_in_at   timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint visits_period_not_empty check (not isempty(period)),
  constraint visits_no_overlap exclude using gist (
    coordinator_id with =,
    period with &&
  ) where (status in ('pending_confirmation', 'confirmed', 'checked_in') and is_exclusive)
);

create index visits_tenant_period_idx on public.visits using gist (tenant_id, period);
create index visits_tenant_status_idx on public.visits (tenant_id, status);
create index visits_lead_idx on public.visits (lead_id);
create index visits_slot_idx on public.visits (slot_id);
create index visits_coordinator_idx on public.visits (coordinator_id, status);

create trigger trg_visits_updated_at
before update on public.visits
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- calendar_events: evento padronizado (RF-04)
-- -----------------------------------------------------------------------------
create table public.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  visit_id        uuid not null unique references public.visits(id) on delete cascade,
  coordinator_id  uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  description     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  confirmed_at    timestamptz,
  confirmed_by    uuid references public.profiles(id) on delete set null,
  declined_at     timestamptz,
  declined_by     uuid references public.profiles(id) on delete set null,
  decline_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index calendar_events_coordinator_starts_idx on public.calendar_events (coordinator_id, starts_at);
create index calendar_events_tenant_starts_idx on public.calendar_events (tenant_id, starts_at);

create trigger trg_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

-- Título padronizado: "Visita Individual - [Nome do Candidato]"
create or replace function public.build_visit_event_title(p_type public.visit_type, p_candidate_name text, p_group_name text default null)
returns text
language sql
immutable
as $$
  select case
    when p_type = 'group' then 'Visita em Grupo - ' || coalesce(nullif(trim(p_group_name), ''), trim(p_candidate_name))
    else 'Visita Individual - ' || trim(p_candidate_name)
  end;
$$;

create or replace function public.create_calendar_event_for_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_name text;
begin
  select full_name into v_lead_name from public.leads where id = new.lead_id;

  insert into public.calendar_events (tenant_id, visit_id, coordinator_id, title, starts_at, ends_at)
  values (
    new.tenant_id,
    new.id,
    new.coordinator_id,
    public.build_visit_event_title(new.type, v_lead_name, new.group_name),
    lower(new.period),
    upper(new.period)
  );

  return new;
end;
$$;

create trigger trg_visits_create_calendar_event
after insert on public.visits
for each row execute function public.create_calendar_event_for_visit();

-- -----------------------------------------------------------------------------
-- Sincronização de status do lead a partir das visitas
-- -----------------------------------------------------------------------------
create or replace function public.sync_lead_status_from_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.leads set status = 'agendado'
    where id = new.lead_id and status in ('novo', 'contatado');
  elsif new.status = 'checked_in' and old.status is distinct from 'checked_in' then
    update public.leads set status = 'visitou'
    where id = new.lead_id and status in ('novo', 'contatado', 'agendado');
  end if;
  return new;
end;
$$;

create trigger trg_visits_sync_lead_status
after insert or update of status on public.visits
for each row execute function public.sync_lead_status_from_visit();

-- -----------------------------------------------------------------------------
-- book_visit(): reserva atômica (RF-03)
-- Erros: P0002 SLOT_NOT_FOUND, P0001 SLOT_UNAVAILABLE, 23P01 (EXCLUDE) COORDINATOR_BUSY
-- -----------------------------------------------------------------------------
create or replace function public.book_visit(
  p_slot_id    uuid,
  p_lead_id    uuid,
  p_type       public.visit_type default 'individual',
  p_group_size integer default 1,
  p_group_name text default null,
  p_notes      text default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot  public.visit_slots%rowtype;
  v_lead  public.leads%rowtype;
  v_visit public.visits%rowtype;
  v_size  integer := greatest(coalesce(p_group_size, 1), 1);
begin
  -- Bloqueia o slot até o fim da transação: serializa reservas concorrentes
  select * into v_slot from public.visit_slots where id = p_slot_id for update;

  if not found or not v_slot.is_open then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002', hint = 'Horário inexistente ou fechado.';
  end if;

  if v_slot.starts_at <= now() then
    raise exception 'SLOT_IN_PAST' using errcode = 'P0001', hint = 'Horário já passou.';
  end if;

  if v_slot.booked_count + v_size > v_slot.capacity then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001', hint = 'Horário sem vagas.';
  end if;

  select * into v_lead from public.leads where id = p_lead_id;
  if not found then
    raise exception 'LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_lead.tenant_id <> v_slot.tenant_id then
    raise exception 'TENANT_MISMATCH' using errcode = '42501';
  end if;

  insert into public.visits (
    tenant_id, lead_id, slot_id, coordinator_id, campus_id, course_id,
    type, group_size, group_name, status, period, is_exclusive, notes
  )
  values (
    v_slot.tenant_id, v_lead.id, v_slot.id, v_slot.coordinator_id, v_slot.campus_id, v_lead.course_id,
    coalesce(p_type, 'individual'), v_size, p_group_name, 'pending_confirmation',
    tstzrange(v_slot.starts_at, v_slot.ends_at, '[)'), v_slot.capacity = 1, p_notes
  )
  returning * into v_visit;

  update public.visit_slots
  set booked_count = booked_count + v_size
  where id = v_slot.id;

  return v_visit;
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_visit(): libera vaga e cancela lembretes (message_jobs, via trigger em 0006)
-- -----------------------------------------------------------------------------
create or replace function public.cancel_visit(p_visit_id uuid, p_reason text default null)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits%rowtype;
begin
  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_visit.status in ('cancelled', 'checked_in', 'no_show') then
    raise exception 'VISIT_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  update public.visits
  set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
  where id = p_visit_id
  returning * into v_visit;

  update public.visit_slots
  set booked_count = greatest(booked_count - v_visit.group_size, 0)
  where id = v_visit.slot_id;

  return v_visit;
end;
$$;

-- -----------------------------------------------------------------------------
-- Confirmação / recusa pelo professor responsável (RF-04)
-- -----------------------------------------------------------------------------
create or replace function public.confirm_calendar_event(p_event_id uuid, p_actor_id uuid default auth.uid())
returns public.calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.calendar_events%rowtype;
begin
  select * into v_event from public.calendar_events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_event.confirmed_at is not null then
    return v_event;
  end if;
  if v_event.declined_at is not null then
    raise exception 'EVENT_ALREADY_DECLINED' using errcode = 'P0001';
  end if;

  update public.calendar_events
  set confirmed_at = now(), confirmed_by = p_actor_id
  where id = p_event_id
  returning * into v_event;

  update public.visits
  set status = 'confirmed'
  where id = v_event.visit_id and status = 'pending_confirmation';

  return v_event;
end;
$$;

create or replace function public.decline_calendar_event(p_event_id uuid, p_reason text default null, p_actor_id uuid default auth.uid())
returns public.calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.calendar_events%rowtype;
begin
  select * into v_event from public.calendar_events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.calendar_events
  set declined_at = now(), declined_by = p_actor_id, decline_reason = p_reason
  where id = p_event_id
  returning * into v_event;

  perform public.cancel_visit(v_event.visit_id, coalesce(p_reason, 'Recusada pelo coordenador'));

  return v_event;
end;
$$;

-- -----------------------------------------------------------------------------
-- generate_visit_slots(): materializa slots a partir das regras (janela de datas)
-- Ignora períodos bloqueados em availability_exceptions e slots já existentes.
-- -----------------------------------------------------------------------------
create or replace function public.generate_visit_slots(
  p_tenant_id uuid,
  p_from      date,
  p_to        date,
  p_coordinator_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz        text;
  v_rule      public.availability_rules%rowtype;
  v_day       date;
  v_start     timestamptz;
  v_end       timestamptz;
  v_slot_end  timestamptz;
  v_inserted  integer := 0;
begin
  select timezone into v_tz from public.tenants where id = p_tenant_id;
  if v_tz is null then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  for v_rule in
    select * from public.availability_rules
    where tenant_id = p_tenant_id
      and is_active
      and (p_coordinator_id is null or coordinator_id = p_coordinator_id)
  loop
    v_day := p_from;
    while v_day <= p_to loop
      if extract(dow from v_day)::int = v_rule.weekday
         and (v_rule.valid_from is null or v_day >= v_rule.valid_from)
         and (v_rule.valid_until is null or v_day <= v_rule.valid_until)
      then
        v_start := (v_day + v_rule.start_time) at time zone v_tz;
        v_end   := (v_day + v_rule.end_time) at time zone v_tz;

        while v_start + make_interval(mins => v_rule.slot_duration_minutes) <= v_end loop
          v_slot_end := v_start + make_interval(mins => v_rule.slot_duration_minutes);

          if not exists (
            select 1 from public.availability_exceptions e
            where e.coordinator_id = v_rule.coordinator_id
              and e.kind = 'block'
              and e.period && tstzrange(v_start, v_slot_end, '[)')
          ) then
            begin
              insert into public.visit_slots (
                tenant_id, campus_id, coordinator_id, starts_at, ends_at, capacity, generated_from_rule
              )
              values (
                v_rule.tenant_id, v_rule.campus_id, v_rule.coordinator_id, v_start, v_slot_end,
                v_rule.capacity, v_rule.id
              );
              v_inserted := v_inserted + 1;
            exception
              when unique_violation or exclusion_violation then
                null; -- slot já existe ou sobrepõe outro: ignora
            end;
          end if;

          v_start := v_slot_end;
        end loop;
      end if;
      v_day := v_day + 1;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consulta pública de horários disponíveis (RF-02)
-- -----------------------------------------------------------------------------
create or replace function public.available_slots(
  p_campus_id uuid,
  p_from      timestamptz,
  p_to        timestamptz,
  p_course_id uuid default null
)
returns table (
  slot_id          uuid,
  coordinator_id   uuid,
  coordinator_name text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  capacity         integer,
  remaining        integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.coordinator_id,
    p.full_name,
    s.starts_at,
    s.ends_at,
    s.capacity,
    s.capacity - s.booked_count
  from public.visit_slots s
  join public.profiles p on p.id = s.coordinator_id and p.is_active
  join public.tenants t on t.id = s.tenant_id
  where s.campus_id = p_campus_id
    and s.is_open
    and s.booked_count < s.capacity
    and s.starts_at >= greatest(p_from, now() + make_interval(hours => coalesce((t.settings ->> 'min_booking_notice_hours')::int, 0)))
    and s.starts_at < p_to
    and (
      p_course_id is null
      or exists (
        select 1 from public.coordinator_courses cc
        where cc.coordinator_id = s.coordinator_id and cc.course_id = p_course_id
      )
    )
  order by s.starts_at;
$$;
