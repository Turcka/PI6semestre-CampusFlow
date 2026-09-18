-- =============================================================================
-- 0016_rubeus_analytics.sql
-- Rubeus, views do dashboard e crons revisados (§3.10, §3.11)
-- =============================================================================

select pgmq.create('rubeus_outbound');

create table public.rubeus_links (
  candidate_id           uuid primary key references public.candidates(id) on delete cascade,
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  tracking_code          text not null,
  rubeus_contact_id      text,
  rubeus_opportunity_id  text,
  last_pushed_at         timestamptz,
  last_pull_at           timestamptz,
  last_status            text,
  last_error             text
);

create table public.rubeus_outbox (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  candidate_id     uuid not null references public.candidates(id) on delete cascade,
  visit_id         uuid references public.visits(id) on delete set null,
  event            public.conversion_event_type not null,
  payload          jsonb not null default '{}'::jsonb,
  status           public.outbox_status not null default 'pending',
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index rubeus_outbox_pending_idx
  on public.rubeus_outbox (status, next_attempt_at)
  where status = 'pending';

create table public.conversion_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  visit_id      uuid references public.visits(id) on delete set null,
  type          public.conversion_event_type not null,
  source        public.conversion_source not null default 'system',
  occurred_at   timestamptz not null default now(),
  raw           jsonb not null default '{}'::jsonb
);

create index conversion_events_candidate_idx on public.conversion_events (candidate_id, occurred_at desc);
create index conversion_events_tenant_type_idx on public.conversion_events (tenant_id, type, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Triggers Rubeus
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_rubeus_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.conversion_event_type;
  v_candidate_id uuid;
  v_tenant_id uuid;
  v_visit_id uuid;
  v_tracking text;
begin
  if tg_table_name = 'candidates' then
    v_event := 'visit_registered';
    v_candidate_id := new.id;
    v_tenant_id := new.tenant_id;
    v_tracking := new.tracking_code;
    insert into public.rubeus_links (candidate_id, tenant_id, tracking_code)
    values (new.id, new.tenant_id, new.tracking_code)
    on conflict (candidate_id) do nothing;
  elsif tg_table_name = 'visits' then
    if new.status not in ('realizada', 'ausente') then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.status = new.status then
      return new;
    end if;
    v_event := 'visit_completed';
    v_candidate_id := new.candidate_id;
    v_tenant_id := new.tenant_id;
    v_visit_id := new.id;
    select tracking_code into v_tracking from public.candidates where id = new.candidate_id;
  else
    return new;
  end if;

  insert into public.rubeus_outbox (tenant_id, candidate_id, visit_id, event, payload)
  values (
    v_tenant_id,
    v_candidate_id,
    v_visit_id,
    v_event,
    jsonb_build_object(
      'tracking_code', v_tracking,
      'event', v_event,
      'visit_id', v_visit_id,
      'candidate_id', v_candidate_id
    )
  );

  insert into public.conversion_events (tenant_id, candidate_id, visit_id, type, source)
  values (v_tenant_id, v_candidate_id, v_visit_id, v_event, 'system');

  perform public.queue_send(
    'rubeus_outbound',
    jsonb_build_object(
      'candidate_id', v_candidate_id,
      'visit_id', v_visit_id,
      'event', v_event,
      'tracking_code', v_tracking
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_candidates_rubeus on public.candidates;
create trigger trg_candidates_rubeus
after insert on public.candidates
for each row execute function public.enqueue_rubeus_event();

drop trigger if exists trg_visits_rubeus on public.visits;
create trigger trg_visits_rubeus
after update of status on public.visits
for each row execute function public.enqueue_rubeus_event();

-- -----------------------------------------------------------------------------
-- Views do dashboard
-- -----------------------------------------------------------------------------
create or replace view public.vw_visits_kpis as
select
  v.tenant_id,
  v.campus_id,
  v.course_id,
  v.promoter_id,
  (lower(v.period) at time zone t.timezone)::date as day,
  count(*) filter (where v.status not in ('cancelada')) as agendadas,
  count(*) filter (where v.status = 'confirmada') as confirmadas,
  count(*) filter (where v.status = 'realizada') as realizadas,
  count(*) filter (where v.status = 'ausente') as ausentes,
  count(*) filter (where v.status = 'cancelada') as canceladas,
  count(*) filter (where v.status = 'reagendada') as reagendadas,
  case when count(*) filter (where v.status in ('realizada','ausente')) > 0
    then count(*) filter (where v.status = 'realizada')::numeric
         / count(*) filter (where v.status in ('realizada','ausente'))
    else null end as taxa_comparecimento,
  case when count(*) > 0
    then count(*) filter (where v.status = 'cancelada')::numeric / count(*)
    else null end as taxa_cancelamento,
  case when count(*) > 0
    then count(*) filter (where v.status = 'reagendada')::numeric / count(*)
    else null end as taxa_reagendamento
from public.visits v
join public.tenants t on t.id = v.tenant_id
group by v.tenant_id, v.campus_id, v.course_id, v.promoter_id,
         (lower(v.period) at time zone t.timezone)::date;

create or replace view public.vw_slot_occupancy as
select
  s.tenant_id,
  s.owner_id as promoter_id,
  date_trunc('week', s.starts_at)::date as week,
  count(*) as slots_open,
  sum(s.booked_count) as booked,
  sum(s.capacity) as capacity,
  case when sum(s.capacity) > 0
    then sum(s.booked_count)::numeric / sum(s.capacity)
    else 0 end as occupancy_rate
from public.visit_slots s
where s.is_open
group by s.tenant_id, s.owner_id, date_trunc('week', s.starts_at)::date;

create or replace view public.vw_reassignment_metrics as
select
  r.tenant_id,
  r.reason,
  r.from_profile_id as promoter_id,
  date_trunc('day', r.created_at)::date as day,
  count(*) as reassignments,
  count(*) filter (where r.to_profile_id is null) as without_substitute
from public.visit_reassignments r
group by r.tenant_id, r.reason, r.from_profile_id, date_trunc('day', r.created_at)::date;

create or replace view public.vw_promoter_performance as
select
  p.id as promoter_id,
  p.tenant_id,
  p.full_name,
  pp.rating_avg,
  pp.visits_completed,
  count(v.id) filter (where v.status = 'realizada') as visits_realized,
  count(v.id) filter (where v.status = 'ausente') as visits_absent,
  case when count(v.id) filter (where v.status in ('realizada','ausente')) > 0
    then count(v.id) filter (where v.status = 'realizada')::numeric
         / count(v.id) filter (where v.status in ('realizada','ausente'))
    else null end as attendance_rate,
  (select count(*) from public.visit_reassignments vr
   where vr.from_profile_id = p.id) as reassignments_suffered
from public.profiles p
join public.promoter_profiles pp on pp.profile_id = p.id
left join public.visits v on v.promoter_id = p.id
where p.role = 'promotor'
group by p.id, p.tenant_id, p.full_name, pp.rating_avg, pp.visits_completed;

create or replace view public.vw_conversion as
select
  c.tenant_id,
  c.course_id,
  v.focus,
  date_trunc('month', coalesce(v.completed_at, v.created_at))::date as period,
  case
    when mres.score >= 0.85 then 'alta'
    when mres.score >= 0.65 then 'media'
    else 'baixa'
  end as compatibility_band,
  count(distinct c.id) as candidates,
  count(distinct c.id) filter (where c.status = 'matriculado') as enrolled,
  case when count(distinct c.id) > 0
    then count(distinct c.id) filter (where c.status = 'matriculado')::numeric / count(distinct c.id)
    else 0 end as conversion_rate
from public.candidates c
left join public.visits v on v.candidate_id = c.id and v.status = 'realizada'
left join public.match_results mres on mres.run_id = v.match_run_id and mres.is_selected
group by c.tenant_id, c.course_id, v.focus,
         date_trunc('month', coalesce(v.completed_at, v.created_at))::date,
         case
           when mres.score >= 0.85 then 'alta'
           when mres.score >= 0.65 then 'media'
           else 'baixa'
         end;

create materialized view public.mv_visits_daily as
select
  v.tenant_id,
  v.campus_id,
  v.course_id,
  (lower(v.period) at time zone t.timezone)::date as day,
  count(*) as visits_total,
  count(*) filter (where v.status = 'realizada') as realizadas,
  count(*) filter (where v.status = 'ausente') as ausentes,
  count(*) filter (where v.status = 'cancelada') as canceladas,
  count(*) filter (where v.status = 'confirmada') as confirmadas
from public.visits v
join public.tenants t on t.id = v.tenant_id
group by v.tenant_id, v.campus_id, v.course_id,
         (lower(v.period) at time zone t.timezone)::date;

create unique index mv_visits_daily_pk
  on public.mv_visits_daily (tenant_id, campus_id, course_id, day);

-- -----------------------------------------------------------------------------
-- Jobs e retenção
-- -----------------------------------------------------------------------------
create or replace function public.mark_absent_visits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.visits v
    set status = 'ausente', absent_marked_at = now()
    from public.tenants t
    where t.id = v.tenant_id
      and v.status = 'confirmada'
      and v.checked_in_at is null
      and upper(v.period) + make_interval(mins => coalesce((t.settings ->> 'no_show_grace_minutes')::int, 30)) < now()
    returning v.id
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

create or replace function public.alert_unattended_visits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_visit record;
begin
  for v_visit in
    select id, tenant_id, status
    from public.visits
    where status in ('aguardando_promotor', 'aguardando_professor')
      and lower(period) between now() and now() + interval '24 hours'
      and not exists (
        select 1 from public.admin_alerts a
        where a.visit_id = visits.id
          and a.kind = 'visit_unattended'
          and a.resolved_at is null
      )
  loop
    insert into public.admin_alerts (tenant_id, kind, visit_id, severity, message)
    values (
      v_visit.tenant_id, 'visit_unattended', v_visit.id, 'critical',
      'Visita nas próximas 24h ainda em status ' || v_visit.status::text
    );
    perform public.schedule_visit_communications(v_visit.id, 'admin.visit_unattended');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.anonymize_candidate(p_candidate_id uuid)
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
    cpf = null,
    profile_summary = null,
    behavioral_profile = '{}'::jsonb,
    availability_windows = '[]'::jsonb,
    anonymized_at = now(),
    metadata = '{}'::jsonb
  where id = p_candidate_id and anonymized_at is null;

  update public.chatbot_answers a
  set value = '{"anonymized": true}'::jsonb
  from public.chatbot_sessions s
  where s.id = a.session_id and s.candidate_id = p_candidate_id;

  update public.message_logs set to_address = '[anonimizado]' where candidate_id = p_candidate_id;
  update public.message_jobs set status = 'cancelled'
  where candidate_id = p_candidate_id and status = 'scheduled';
end;
$$;

create or replace function public.apply_candidate_retention()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select id from public.candidates
    where status = 'perdido'
      and anonymized_at is null
      and updated_at < now() - interval '24 months'
  loop
    perform public.anonymize_candidate(v_row.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Wrappers legados
create or replace function public.anonymize_lead(p_lead_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.anonymize_candidate(p_lead_id);
end;
$$;

create or replace function public.apply_lead_retention()
returns integer language plpgsql security definer set search_path = public as $$
begin
  return public.apply_candidate_retention();
end;
$$;

create or replace function public.mark_no_shows()
returns integer language plpgsql security definer set search_path = public as $$
begin
  return public.mark_absent_visits();
end;
$$;

select cron.schedule('expire-invitations', '* * * * *', $$ select public.expire_pending_invitations(); $$);
select cron.schedule('mark-absent-visits', '*/15 * * * *', $$ select public.mark_absent_visits(); $$);
select cron.schedule('alert-unattended-visits', '0 * * * *', $$ select public.alert_unattended_visits(); $$);
select cron.schedule('refresh-mv-visits-daily', '0 * * * *', $$ refresh materialized view public.mv_visits_daily; $$);
select cron.schedule('apply-candidate-retention', '0 3 * * 0', $$ select public.apply_candidate_retention(); $$);
