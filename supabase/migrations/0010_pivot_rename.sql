-- =============================================================================
-- 0010_pivot_rename.sql
-- Pivot aos novos requisitos: enums, papéis e renomeações.
-- Não reescreve 0001–0009; evolui o schema remoto de forma incremental.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Remover views/MV e crons que dependem de nomes/status antigos
-- -----------------------------------------------------------------------------
drop materialized view if exists public.mv_leads_daily;
drop view if exists public.vw_funnel;
drop view if exists public.vw_visits_summary;
-- vw_messaging_metrics não referencia leads/status de visita; mantém

do $$
begin
  perform cron.unschedule('mark-no-shows');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('refresh-mv-leads-daily');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('consolidate-usage-metrics');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('apply-lead-retention');
exception when others then null;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Políticas RLS que citam papéis/tabelas antigos (recriadas em 0017)
-- -----------------------------------------------------------------------------
drop policy if exists courses_write on public.courses;
drop policy if exists coordinator_courses_select on public.coordinator_courses;
drop policy if exists coordinator_courses_write on public.coordinator_courses;
drop policy if exists leads_select on public.leads;
drop policy if exists leads_write on public.leads;
drop policy if exists lead_imports_write on public.lead_imports;
drop policy if exists lead_tags_write on public.lead_tags;
drop policy if exists lead_tag_assignments_select on public.lead_tag_assignments;
drop policy if exists lead_tag_assignments_write on public.lead_tag_assignments;
drop policy if exists availability_rules_write on public.availability_rules;
drop policy if exists availability_exceptions_write on public.availability_exceptions;
drop policy if exists visit_slots_write on public.visit_slots;
drop policy if exists visits_write on public.visits;
drop policy if exists calendar_events_update on public.calendar_events;
drop policy if exists message_templates_write on public.message_templates;
drop policy if exists communication_rules_write on public.communication_rules;
drop policy if exists campaigns_write on public.campaigns;
drop policy if exists message_jobs_select on public.message_jobs;
drop policy if exists message_logs_select on public.message_logs;
drop policy if exists pois_write on public.pois;
drop policy if exists routes_write on public.routes;
drop policy if exists itineraries_write on public.itineraries;
drop policy if exists checkins_write on public.checkins;
drop policy if exists poi_photos_write on public.poi_photos;
drop policy if exists route_points_write on public.route_points;

-- -----------------------------------------------------------------------------
-- 3) Remover EXCLUDE antiga (predicado usa status do enum antigo)
-- -----------------------------------------------------------------------------
alter table public.visits drop constraint if exists visits_no_overlap;

-- -----------------------------------------------------------------------------
-- 4) Novo user_role
-- -----------------------------------------------------------------------------
create type public.user_role_v2 as enum ('admin', 'promotor', 'professor');

drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;
drop policy if exists tenants_update on public.tenants;
drop policy if exists campuses_write on public.campuses;
drop policy if exists usage_metrics_select on public.usage_metrics;
drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists "tenant-assets admin write" on storage.objects;
drop policy if exists "poi-photos tenant write" on storage.objects;
drop policy if exists "lead-imports tenant rw" on storage.objects;

alter table public.profiles alter column role drop default;

alter table public.profiles
  alter column role type public.user_role_v2
  using (
    case role::text
      when 'admin' then 'admin'
      when 'secretaria' then 'admin'
      when 'marketing' then 'admin'
      when 'coordenador' then 'professor'
      when 'embaixador' then 'promotor'
      else 'admin'
    end
  )::public.user_role_v2;

alter table public.profiles alter column role set default 'admin'::public.user_role_v2;

-- Funções que dependem do tipo antigo precisam ser recriadas após o rename
drop function if exists public.current_user_role();
drop function if exists public.has_role(variadic public.user_role[]);

drop type public.user_role;
alter type public.user_role_v2 rename to user_role;

alter table public.profiles alter column role set default 'admin'::public.user_role;

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

create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and tenant_id = public.current_tenant_id() and role = public.current_user_role());

create policy profiles_admin_write on public.profiles for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy tenants_update on public.tenants for update
  using (id = public.current_tenant_id() and public.has_role('admin'))
  with check (id = public.current_tenant_id());

create policy campuses_write on public.campuses for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy usage_metrics_select on public.usage_metrics for select
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy audit_logs_select on public.audit_logs for select
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy "tenant-assets admin write" on storage.objects for all
  using (
    bucket_id = 'tenant-assets'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin')
  )
  with check (
    bucket_id = 'tenant-assets'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin')
  );

-- -----------------------------------------------------------------------------
-- 5) Novo visit_status
-- -----------------------------------------------------------------------------
create type public.visit_status_v2 as enum (
  'agendada',
  'aguardando_promotor',
  'aguardando_professor',
  'confirmada',
  'em_atendimento',
  'realizada',
  'ausente',
  'cancelada',
  'reagendada'
);

alter table public.visits alter column status drop default;

-- Funções/triggers que referenciam o enum antigo de status
drop trigger if exists trg_visits_status_communications on public.visits;
drop trigger if exists trg_visits_sync_lead_status on public.visits;
drop function if exists public.on_visit_status_change();
drop function if exists public.sync_lead_status_from_visit();
drop function if exists public.book_visit(uuid, uuid, public.visit_type, integer, text, text);
drop function if exists public.cancel_visit(uuid, text);
drop function if exists public.confirm_calendar_event(uuid, uuid);
drop function if exists public.decline_calendar_event(uuid, text, uuid);
drop function if exists public.mark_no_shows();
drop function if exists public.check_in_visit(uuid, uuid, jsonb);

alter table public.visits
  alter column status type public.visit_status_v2
  using (
    case status::text
      when 'pending_confirmation' then 'aguardando_promotor'
      when 'confirmed' then 'confirmada'
      when 'checked_in' then 'realizada'
      when 'no_show' then 'ausente'
      when 'cancelled' then 'cancelada'
      else 'agendada'
    end
  )::public.visit_status_v2;

alter table public.visits alter column status set default 'agendada'::public.visit_status_v2;

drop type public.visit_status cascade;
alter type public.visit_status_v2 rename to visit_status;

alter table public.visits alter column status set default 'agendada'::public.visit_status;

-- -----------------------------------------------------------------------------
-- 6) Novos enums / valores
-- -----------------------------------------------------------------------------
create type public.visit_focus as enum ('tecnico', 'academico', 'profissional', 'institucional');
create type public.participant_role as enum ('promotor', 'professor');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'expired', 'cancelled');
create type public.match_criterion_kind as enum ('mandatory', 'complementary', 'tiebreaker');
create type public.professor_requirement as enum ('required', 'recommended', 'not_needed');
create type public.question_kind as enum ('single_choice', 'multi_choice', 'scale', 'free_text');
create type public.conversion_event_type as enum ('visit_registered', 'visit_completed', 'lead_updated', 'enrolled', 'lost');
create type public.chatbot_audience as enum ('candidato', 'promotor');
create type public.chatbot_session_status as enum ('in_progress', 'review', 'completed', 'abandoned');
create type public.match_run_status as enum ('completed', 'no_candidates');
create type public.match_run_trigger as enum ('initial', 'reassignment', 'manual');
create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.alert_kind as enum (
  'no_substitute',
  'visit_unattended',
  'professor_required_missing',
  'invitation_expiring',
  'schedule_conflict'
);
create type public.reassignment_reason as enum ('declined', 'expired', 'last_minute', 'admin');
create type public.note_phase as enum ('before', 'during', 'after');
create type public.itinerary_item_source as enum ('suggested', 'manual');
create type public.outbox_status as enum ('pending', 'sent', 'failed');
create type public.conversion_source as enum ('system', 'rubeus', 'manual');
create type public.notification_audience as enum ('candidato', 'promotor', 'professor', 'admin');

alter type public.communication_trigger add value if not exists 'visit.scheduled';
alter type public.communication_trigger add value if not exists 'promoter.invited';
alter type public.communication_trigger add value if not exists 'promoter.reassigned';
alter type public.communication_trigger add value if not exists 'professor.requested';
alter type public.communication_trigger add value if not exists 'visit.rescheduled';
alter type public.communication_trigger add value if not exists 'admin.no_substitute';
alter type public.communication_trigger add value if not exists 'admin.visit_unattended';
alter type public.availability_exception_kind add value if not exists 'last_minute';

-- -----------------------------------------------------------------------------
-- 7) Renomeações
-- -----------------------------------------------------------------------------
alter table public.leads rename to candidates;
alter index if exists leads_tenant_email_unique rename to candidates_tenant_email_unique;
alter index if exists leads_tenant_phone_unique rename to candidates_tenant_phone_unique;
alter index if exists leads_tenant_created_idx rename to candidates_tenant_created_idx;
alter index if exists leads_tenant_status_idx rename to candidates_tenant_status_idx;
alter index if exists leads_tenant_course_idx rename to candidates_tenant_course_idx;
alter index if exists leads_tenant_source_idx rename to candidates_tenant_source_idx;
alter index if exists leads_full_name_trgm_idx rename to candidates_full_name_trgm_idx;
alter index if exists leads_email_trgm_idx rename to candidates_email_trgm_idx;
alter trigger trg_leads_updated_at on public.candidates rename to trg_candidates_updated_at;

alter table public.coordinator_courses rename to promoter_courses;
alter table public.promoter_courses rename column coordinator_id to promoter_id;
alter index if exists coordinator_courses_course_idx rename to promoter_courses_course_idx;

alter table public.availability_rules rename column coordinator_id to owner_id;
alter index if exists availability_rules_coordinator_idx rename to availability_rules_owner_idx;

alter table public.availability_exceptions rename column coordinator_id to owner_id;

alter table public.visit_slots rename column coordinator_id to owner_id;
alter index if exists visit_slots_coordinator_starts_idx rename to visit_slots_owner_starts_idx;

alter table public.visits rename column lead_id to candidate_id;
alter table public.visits rename column coordinator_id to promoter_id;
alter index if exists visits_lead_idx rename to visits_candidate_idx;
alter index if exists visits_coordinator_idx rename to visits_promoter_idx;

alter table public.calendar_events rename column coordinator_id to promoter_id;
alter index if exists calendar_events_coordinator_starts_idx rename to calendar_events_promoter_starts_idx;

alter table public.message_jobs rename column lead_id to candidate_id;
alter table public.message_logs rename column lead_id to candidate_id;
alter index if exists message_logs_lead_idx rename to message_logs_candidate_idx;

-- -----------------------------------------------------------------------------
-- 8) Comentários de legado congelado
-- -----------------------------------------------------------------------------
comment on table public.lead_imports is 'LEGADO: importação em massa fora do escopo (Revisão 2).';
comment on table public.lead_tags is 'LEGADO: tags de lead fora do escopo (Revisão 2).';
comment on table public.lead_tag_assignments is 'LEGADO: tags de lead fora do escopo (Revisão 2).';
comment on table public.campaigns is 'LEGADO: campanhas em massa fora do escopo (Revisão 2).';
comment on table public.checkins is 'LEGADO: check-in por QR fora do escopo; comparecimento via status da visita.';
comment on table public.plans is 'LEGADO: billing SaaS fora do núcleo (Revisão 2).';
comment on table public.tenant_subscriptions is 'LEGADO: billing SaaS fora do núcleo (Revisão 2).';
comment on table public.usage_metrics is 'LEGADO: billing SaaS fora do núcleo (Revisão 2).';
comment on column public.candidates.hygiene_status is 'LEGADO: higienização de importação fora do escopo.';
comment on column public.candidates.duplicate_of is 'LEGADO: deduplicação de importação fora do escopo.';
comment on column public.candidates.import_id is 'LEGADO: vínculo com lead_imports fora do escopo.';

-- -----------------------------------------------------------------------------
-- 9) Funções legadas reescritas com novos nomes (substituídas nas etapas seguintes)
-- -----------------------------------------------------------------------------
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
    return new;
  end if;

  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'admin');

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

create or replace function public.create_calendar_event_for_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_name text;
begin
  select full_name into v_candidate_name from public.candidates where id = new.candidate_id;

  if new.promoter_id is null then
    return new;
  end if;

  insert into public.calendar_events (tenant_id, visit_id, promoter_id, title, starts_at, ends_at)
  values (
    new.tenant_id,
    new.id,
    new.promoter_id,
    public.build_visit_event_title(new.type, v_candidate_name, new.group_name),
    lower(new.period),
    upper(new.period)
  );

  return new;
end;
$$;

create or replace function public.sync_lead_status_from_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.candidates set status = 'agendado'
    where id = new.candidate_id and status in ('novo', 'contatado');
  elsif new.status = 'realizada' and old.status is distinct from 'realizada' then
    update public.candidates set status = 'visitou'
    where id = new.candidate_id and status in ('novo', 'contatado', 'agendado');
  end if;
  return new;
end;
$$;

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
  v_slot      public.visit_slots%rowtype;
  v_candidate public.candidates%rowtype;
  v_visit     public.visits%rowtype;
  v_size      integer := greatest(coalesce(p_group_size, 1), 1);
begin
  select * into v_slot from public.visit_slots where id = p_slot_id for update;
  if not found or not v_slot.is_open then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'SLOT_IN_PAST' using errcode = 'P0001';
  end if;
  if v_slot.booked_count + v_size > v_slot.capacity then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select * into v_candidate from public.candidates where id = p_lead_id;
  if not found then
    raise exception 'LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_candidate.tenant_id <> v_slot.tenant_id then
    raise exception 'TENANT_MISMATCH' using errcode = '42501';
  end if;

  insert into public.visits (
    tenant_id, candidate_id, slot_id, promoter_id, campus_id, course_id,
    type, group_size, group_name, status, period, is_exclusive, notes
  )
  values (
    v_slot.tenant_id, v_candidate.id, v_slot.id, v_slot.owner_id, v_slot.campus_id, v_candidate.course_id,
    coalesce(p_type, 'individual'), v_size, p_group_name, 'aguardando_promotor',
    tstzrange(v_slot.starts_at, v_slot.ends_at, '[)'), v_slot.capacity = 1, p_notes
  )
  returning * into v_visit;

  update public.visit_slots
  set booked_count = booked_count + v_size
  where id = v_slot.id;

  return v_visit;
end;
$$;

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
  if v_visit.status in ('cancelada', 'realizada', 'ausente', 'reagendada') then
    raise exception 'VISIT_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  update public.visits
  set status = 'cancelada', cancelled_at = now(), cancel_reason = p_reason
  where id = p_visit_id
  returning * into v_visit;

  update public.visit_slots
  set booked_count = greatest(booked_count - v_visit.group_size, 0)
  where id = v_visit.slot_id;

  return v_visit;
end;
$$;

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
  set status = 'confirmada'
  where id = v_event.visit_id and status in ('agendada', 'aguardando_promotor', 'aguardando_professor');

  return v_event;
end;
$$;

drop function if exists public.generate_visit_slots(uuid, date, date, uuid);
create or replace function public.generate_visit_slots(
  p_tenant_id uuid,
  p_from      date,
  p_to        date,
  p_owner_id  uuid default null
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
      and (p_owner_id is null or owner_id = p_owner_id)
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
            where e.owner_id = v_rule.owner_id
              and e.kind in ('block', 'last_minute')
              and e.period && tstzrange(v_start, v_slot_end, '[)')
          ) then
            begin
              insert into public.visit_slots (
                tenant_id, campus_id, owner_id, starts_at, ends_at, capacity, generated_from_rule
              )
              values (
                v_rule.tenant_id, v_rule.campus_id, v_rule.owner_id, v_start, v_slot_end,
                v_rule.capacity, v_rule.id
              );
              v_inserted := v_inserted + 1;
            exception
              when unique_violation or exclusion_violation then
                null;
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

drop function if exists public.available_slots(uuid, timestamptz, timestamptz, uuid);
create or replace function public.available_slots(
  p_campus_id uuid,
  p_from      timestamptz,
  p_to        timestamptz,
  p_course_id uuid default null
)
returns table (
  slot_id        uuid,
  owner_id       uuid,
  owner_name     text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  capacity       integer,
  remaining      integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.owner_id,
    p.full_name,
    s.starts_at,
    s.ends_at,
    s.capacity,
    s.capacity - s.booked_count
  from public.visit_slots s
  join public.profiles p on p.id = s.owner_id and p.is_active
  join public.tenants t on t.id = s.tenant_id
  where s.campus_id = p_campus_id
    and s.is_open
    and s.booked_count < s.capacity
    and s.starts_at >= greatest(p_from, now() + make_interval(hours => coalesce((t.settings ->> 'min_booking_notice_hours')::int, 0)))
    and s.starts_at < p_to
    and (
      p_course_id is null
      or exists (
        select 1 from public.promoter_courses pc
        where pc.promoter_id = s.owner_id and pc.course_id = p_course_id
      )
    )
  order by s.starts_at;
$$;

create or replace function public.visit_template_vars(p_visit_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'candidato.nome',          c.full_name,
    'candidato.primeiro_nome', split_part(c.full_name, ' ', 1),
    'candidato.curso',         coalesce(co.name, ''),
    'visita.data',             to_char(lower(v.period) at time zone t.timezone, 'DD/MM/YYYY'),
    'visita.hora',             to_char(lower(v.period) at time zone t.timezone, 'HH24:MI'),
    'visita.tipo',             case when v.type = 'group' then 'em grupo' else 'individual' end,
    'promotor.nome',           coalesce(p.full_name, ''),
    'coordenador.nome',        coalesce(p.full_name, ''),
    'campus.nome',             ca.name,
    'campus.endereco',         coalesce(ca.address, ''),
    'campus.link_mapa',        '/mapa/' || ca.slug,
    'instituicao.nome',        t.name
  )
  from public.visits v
  join public.candidates c on c.id = v.candidate_id
  left join public.profiles p on p.id = v.promoter_id
  join public.campuses ca on ca.id = v.campus_id
  join public.tenants t on t.id = v.tenant_id
  left join public.courses co on co.id = v.course_id
  where v.id = p_visit_id;
$$;

create or replace function public.schedule_visit_communications(
  p_visit_id uuid,
  p_trigger public.communication_trigger
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit     public.visits%rowtype;
  v_candidate public.candidates%rowtype;
  v_promoter  public.profiles%rowtype;
  v_rule      record;
  v_vars      jsonb;
  v_run_at    timestamptz;
  v_to        text;
  v_count     integer := 0;
  v_is_reminder boolean;
begin
  select * into v_visit from public.visits where id = p_visit_id;
  if not found then
    return 0;
  end if;
  select * into v_candidate from public.candidates where id = v_visit.candidate_id;
  select * into v_promoter from public.profiles where id = v_visit.promoter_id;
  v_vars := public.visit_template_vars(p_visit_id);

  for v_rule in
    select r.*, t.subject, t.body, t.provider_template_name, t.id as tpl_id
    from public.communication_rules r
    join public.message_templates t on t.id = r.template_id and t.is_active
    where r.tenant_id = v_visit.tenant_id
      and r.trigger = p_trigger
      and r.is_active
  loop
    v_is_reminder := p_trigger in ('reminder.day_before', 'reminder.hour_before', 'visit.completed');
    v_run_at := case
      when v_is_reminder then lower(v_visit.period) + make_interval(mins => v_rule.offset_minutes)
      else now()
    end;

    if v_is_reminder and v_run_at <= now() then
      continue;
    end if;

    if v_rule.audience in ('candidate', 'candidato', 'both') then
      v_to := case v_rule.channel when 'whatsapp' then v_candidate.phone else v_candidate.email end;
      if v_to is not null then
        insert into public.message_jobs (
          tenant_id, visit_id, candidate_id, rule_id, template_id, trigger, channel, to_address, run_at, payload
        ) values (
          v_visit.tenant_id, v_visit.id, v_candidate.id, v_rule.id, v_rule.tpl_id, p_trigger, v_rule.channel, v_to, v_run_at,
          jsonb_build_object(
            'subject', public.render_template(v_rule.subject, v_vars),
            'body', public.render_template(v_rule.body, v_vars),
            'provider_template_name', v_rule.provider_template_name,
            'vars', v_vars
          )
        );
        v_count := v_count + 1;
      end if;
    end if;

    if v_rule.audience in ('coordinator', 'promotor', 'both') and v_promoter.id is not null then
      v_to := case v_rule.channel when 'whatsapp' then v_promoter.phone else v_promoter.email end;
      if v_to is not null then
        insert into public.message_jobs (
          tenant_id, visit_id, candidate_id, rule_id, template_id, trigger, channel, to_address, run_at, payload
        ) values (
          v_visit.tenant_id, v_visit.id, v_candidate.id, v_rule.id, v_rule.tpl_id, p_trigger, v_rule.channel, v_to, v_run_at,
          jsonb_build_object(
            'subject', public.render_template(v_rule.subject, v_vars),
            'body', public.render_template(v_rule.body, v_vars),
            'provider_template_name', v_rule.provider_template_name,
            'vars', v_vars
          )
        );
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.on_visit_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.schedule_visit_communications(new.id, 'visit.created');
    perform public.schedule_visit_communications(new.id, 'visit.scheduled');
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'confirmada' then
    perform public.schedule_visit_communications(new.id, 'visit.confirmed');
    perform public.schedule_visit_communications(new.id, 'reminder.day_before');
    perform public.schedule_visit_communications(new.id, 'reminder.hour_before');
  elsif new.status in ('cancelada', 'reagendada') then
    update public.message_jobs set status = 'cancelled'
    where visit_id = new.id and status = 'scheduled';
    if new.status = 'cancelada' then
      perform public.schedule_visit_communications(new.id, 'visit.cancelled');
    else
      perform public.schedule_visit_communications(new.id, 'visit.rescheduled');
    end if;
  elsif new.status in ('realizada', 'ausente') then
    update public.message_jobs set status = 'cancelled'
    where visit_id = new.id and status = 'scheduled' and trigger in ('reminder.day_before', 'reminder.hour_before');
    perform public.schedule_visit_communications(new.id, 'visit.completed');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_visits_status_communications on public.visits;
create trigger trg_visits_status_communications
after insert or update of status on public.visits
for each row execute function public.on_visit_status_change();

drop trigger if exists trg_visits_sync_lead_status on public.visits;
create trigger trg_visits_sync_lead_status
after insert or update of status on public.visits
for each row execute function public.sync_lead_status_from_visit();

create or replace function public.check_in_visit(
  p_token uuid,
  p_scanned_by uuid default null,
  p_location jsonb default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'CHECKIN_LEGACY_DISABLED'
    using errcode = 'P0001',
          hint = 'Use set_visit_status (em_atendimento / realizada / ausente).';
end;
$$;

create or replace function public.mark_no_shows()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Substituída por mark_absent_visits em 0016
  return 0;
end;
$$;

create or replace function public.anonymize_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.candidates
  set
    full_name = 'Anonimizado',
    email = null,
    phone = null,
    anonymized_at = now(),
    metadata = '{}'::jsonb
  where id = p_lead_id and anonymized_at is null;

  update public.message_logs set to_address = '[anonimizado]' where candidate_id = p_lead_id;
  update public.message_jobs set status = 'cancelled'
  where candidate_id = p_lead_id and status = 'scheduled';
end;
$$;

create or replace function public.apply_lead_retention()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_count integer := 0;
begin
  for v_candidate in
    select id from public.candidates
    where status = 'perdido'
      and anonymized_at is null
      and updated_at < now() - interval '24 months'
  loop
    perform public.anonymize_lead(v_candidate.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.promote_due_message_jobs(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_count integer := 0;
begin
  for v_job in
    select id, tenant_id, visit_id, candidate_id, campaign_id, template_id, channel, to_address, payload
    from public.message_jobs
    where status = 'scheduled' and run_at <= now()
    order by run_at
    limit p_limit
    for update skip locked
  loop
    update public.message_jobs
    set status = 'enqueued', enqueued_at = now()
    where id = v_job.id;

    perform public.queue_send(
      'messages_outbound',
      jsonb_build_object(
        'job_id',      v_job.id,
        'tenant_id',   v_job.tenant_id,
        'visit_id',    v_job.visit_id,
        'candidate_id', v_job.candidate_id,
        'campaign_id', v_job.campaign_id,
        'template_id', v_job.template_id,
        'channel',     v_job.channel,
        'to_address',  v_job.to_address,
        'payload',     v_job.payload
      )
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Políticas mínimas de leitura após renomeação (escrita completa em 0017)
create policy candidates_select on public.candidates for select
  using (public.is_tenant_member(tenant_id));

create policy promoter_courses_select on public.promoter_courses for select
  using (exists (select 1 from public.courses c where c.id = course_id and public.is_tenant_member(c.tenant_id)));

create policy lead_tag_assignments_select on public.lead_tag_assignments for select
  using (exists (select 1 from public.candidates c where c.id = lead_id and public.is_tenant_member(c.tenant_id)));

-- Storage: papéis antigos nas políticas de escrita (já dropadas na seção 4; recria abaixo)
create policy "poi-photos tenant write" on storage.objects for all
  using (
    bucket_id = 'poi-photos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin')
  )
  with check (
    bucket_id = 'poi-photos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin')
  );

create policy "lead-imports tenant rw" on storage.objects for all
  using (
    bucket_id = 'lead-imports'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin')
  )
  with check (
    bucket_id = 'lead-imports'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin')
  );

-- Escritas mínimas para admin enquanto 0017 não aplica RLS completo
create policy courses_write on public.courses for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy candidates_write on public.candidates for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy availability_rules_write on public.availability_rules for all
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or owner_id = auth.uid())
  )
  with check (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or owner_id = auth.uid())
  );

create policy availability_exceptions_write on public.availability_exceptions for all
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or owner_id = auth.uid())
  )
  with check (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or owner_id = auth.uid())
  );

create policy visit_slots_write on public.visit_slots for all
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or owner_id = auth.uid())
  )
  with check (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or owner_id = auth.uid())
  );

create policy visits_write on public.visits for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy calendar_events_update on public.calendar_events for update
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or promoter_id = auth.uid())
  )
  with check (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or promoter_id = auth.uid())
  );

create policy message_templates_write on public.message_templates for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy communication_rules_write on public.communication_rules for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy pois_write on public.pois for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy routes_write on public.routes for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy itineraries_write on public.itineraries for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy poi_photos_write on public.poi_photos for all
  using (exists (select 1 from public.pois p where p.id = poi_id and public.is_tenant_member(p.tenant_id)) and public.has_role('admin'))
  with check (exists (select 1 from public.pois p where p.id = poi_id and public.is_tenant_member(p.tenant_id)) and public.has_role('admin'));

create policy route_points_write on public.route_points for all
  using (exists (select 1 from public.routes r where r.id = route_id and public.is_tenant_member(r.tenant_id)) and public.has_role('admin'))
  with check (exists (select 1 from public.routes r where r.id = route_id and public.is_tenant_member(r.tenant_id)) and public.has_role('admin'));

create policy promoter_courses_write on public.promoter_courses for all
  using (exists (select 1 from public.courses c where c.id = course_id and public.is_tenant_member(c.tenant_id)) and public.has_role('admin'))
  with check (exists (select 1 from public.courses c where c.id = course_id and public.is_tenant_member(c.tenant_id)) and public.has_role('admin'));
