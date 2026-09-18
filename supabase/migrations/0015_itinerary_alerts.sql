-- =============================================================================
-- 0015_itinerary_alerts.sql
-- Roteiro personalizado, alertas e notificações por audience (§3.8, §3.13, §3.14)
-- =============================================================================

create table public.poi_interest_tags (
  poi_id       uuid not null references public.pois(id) on delete cascade,
  category_id  uuid not null references public.interest_categories(id) on delete cascade,
  relevance    integer not null default 3 check (relevance between 1 and 5),
  primary key (poi_id, category_id)
);

create table public.visit_itinerary_items (
  id             uuid primary key default gen_random_uuid(),
  visit_id       uuid not null references public.visits(id) on delete cascade,
  poi_id         uuid not null references public.pois(id) on delete cascade,
  order_index    integer not null,
  reason         text,
  source         public.itinerary_item_source not null default 'suggested',
  added_by       uuid references public.profiles(id) on delete set null,
  dwell_minutes  integer not null default 10,
  constraint visit_itinerary_items_visit_order_unique unique (visit_id, order_index)
);

create index visit_itinerary_items_visit_idx on public.visit_itinerary_items (visit_id);

-- Expandir audience de communication_rules
alter table public.communication_rules drop constraint if exists communication_rules_audience_check;
alter table public.communication_rules
  add constraint communication_rules_audience_check
  check (audience in ('candidate', 'coordinator', 'both', 'candidato', 'promotor', 'professor', 'admin'));

create table public.notification_preferences (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  trigger     public.communication_trigger not null,
  channel     public.message_channel not null default 'email',
  enabled     boolean not null default true,
  primary key (profile_id, trigger, channel)
);

-- -----------------------------------------------------------------------------
-- generate_visit_itinerary
-- -----------------------------------------------------------------------------
create or replace function public.generate_visit_itinerary(p_visit_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit      public.visits%rowtype;
  v_candidate  public.candidates%rowtype;
  v_course     text;
  v_professor  text;
  v_order      integer := 0;
  v_count      integer := 0;
  v_pois       jsonb := '[]'::jsonb;
  v_interests  jsonb := '[]'::jsonb;
  v_row        record;
begin
  select * into v_visit from public.visits where id = p_visit_id;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_candidate from public.candidates where id = v_visit.candidate_id;
  select name into v_course from public.courses where id = v_visit.course_id;
  select full_name into v_professor from public.profiles where id = v_visit.professor_id;

  delete from public.visit_itinerary_items where visit_id = p_visit_id and source = 'suggested';

  -- Roteiro base do curso
  for v_row in
    select rp.poi_id, rp.dwell_minutes, rp.order_index, p.name as poi_name
    from public.itineraries i
    join public.route_points rp on rp.route_id = i.route_id
    join public.pois p on p.id = rp.poi_id
    where i.course_id = v_visit.course_id
    order by rp.order_index
  loop
    if v_visit.promoter_id is not null
       and exists (select 1 from public.promoter_pois pp where pp.promoter_id = v_visit.promoter_id)
       and not exists (
         select 1 from public.promoter_pois pp
         where pp.promoter_id = v_visit.promoter_id and pp.poi_id = v_row.poi_id
       ) then
      continue;
    end if;

    v_order := v_order + 1;
    insert into public.visit_itinerary_items (visit_id, poi_id, order_index, reason, source, dwell_minutes)
    values (p_visit_id, v_row.poi_id, v_order, 'Roteiro base do curso', 'suggested', v_row.dwell_minutes)
    on conflict (visit_id, order_index) do nothing;
    v_count := v_count + 1;
    v_pois := v_pois || jsonb_build_array(jsonb_build_object(
      'poi_id', v_row.poi_id, 'name', v_row.poi_name, 'reason', 'Roteiro base do curso'
    ));
  end loop;

  -- POIs por interesse
  for v_row in
    select p.id as poi_id, p.name as poi_name, ic.name as interest_name,
           (ci.score * pit.relevance) as score, coalesce(max(rp.dwell_minutes), 10) as dwell
    from public.candidate_interests ci
    join public.poi_interest_tags pit on pit.category_id = ci.category_id
    join public.pois p on p.id = pit.poi_id and p.is_active
    join public.interest_categories ic on ic.id = ci.category_id
    left join public.route_points rp on rp.poi_id = p.id
    where ci.candidate_id = v_visit.candidate_id
      and p.campus_id = v_visit.campus_id
      and not exists (
        select 1 from public.visit_itinerary_items vii
        where vii.visit_id = p_visit_id and vii.poi_id = p.id
      )
      and (
        v_visit.promoter_id is null
        or not exists (select 1 from public.promoter_pois pp where pp.promoter_id = v_visit.promoter_id)
        or exists (
          select 1 from public.promoter_pois pp
          where pp.promoter_id = v_visit.promoter_id and pp.poi_id = p.id
        )
      )
    group by p.id, p.name, ic.name, ci.score, pit.relevance
    order by (ci.score * pit.relevance) desc
    limit 5
  loop
    v_order := v_order + 1;
    insert into public.visit_itinerary_items (visit_id, poi_id, order_index, reason, source, dwell_minutes)
    values (
      p_visit_id, v_row.poi_id, v_order,
      'Candidato interessado em ' || v_row.interest_name,
      'suggested', v_row.dwell
    );
    v_count := v_count + 1;
    v_pois := v_pois || jsonb_build_array(jsonb_build_object(
      'poi_id', v_row.poi_id, 'name', v_row.poi_name,
      'reason', 'Candidato interessado em ' || v_row.interest_name
    ));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('slug', ic.slug, 'name', ic.name, 'score', ci.score)), '[]'::jsonb)
  into v_interests
  from public.candidate_interests ci
  join public.interest_categories ic on ic.id = ci.category_id
  where ci.candidate_id = v_visit.candidate_id;

  update public.visits
  set promoter_briefing = jsonb_build_object(
    'candidate', jsonb_build_object(
      'name', v_candidate.full_name,
      'course', v_course,
      'focus', v_visit.focus,
      'summary', v_candidate.profile_summary,
      'top_interests', v_interests
    ),
    'professor', case when v_professor is not null
      then jsonb_build_object('name', v_professor, 'id', v_visit.professor_id)
      else null end,
    'pois', v_pois
  )
  where id = p_visit_id;

  return v_count;
end;
$$;

create or replace view public.vw_promoter_visit_briefing as
select
  v.id as visit_id,
  v.promoter_id,
  v.tenant_id,
  v.status,
  lower(v.period) as starts_at,
  upper(v.period) as ends_at,
  v.focus,
  v.promoter_briefing,
  c.full_name as candidate_name,
  c.profile_summary,
  c.preferred_focus,
  co.name as course_name
from public.visits v
join public.candidates c on c.id = v.candidate_id
left join public.courses co on co.id = v.course_id;

create or replace view public.vw_pending_issues as
select
  'visit_waiting_promoter'::text as issue_type,
  v.tenant_id,
  v.id as visit_id,
  lower(v.period) as due_at,
  'Visita aguardando promotor'::text as message,
  'warning'::public.alert_severity as severity
from public.visits v
where v.status = 'aguardando_promotor'
  and lower(v.period) < now() + interval '48 hours'

union all

select
  'visit_waiting_professor',
  v.tenant_id,
  v.id,
  lower(v.period),
  'Visita aguardando professor',
  'warning'
from public.visits v
where v.status = 'aguardando_professor'
  and lower(v.period) < now() + interval '48 hours'

union all

select
  'invitation_expiring',
  i.tenant_id,
  i.visit_id,
  i.expires_at,
  'Convite expirando em breve',
  'info'
from public.visit_invitations i
where i.status = 'pending'
  and i.expires_at < now() + interval '30 minutes'

union all

select
  'professor_required_missing',
  v.tenant_id,
  v.id,
  lower(v.period),
  'Professor obrigatório não atribuído',
  'critical'
from public.visits v
where v.professor_requirement = 'required'
  and v.professor_id is null
  and v.status not in ('cancelada', 'reagendada', 'realizada', 'ausente')

union all

select
  a.kind::text,
  a.tenant_id,
  a.visit_id,
  a.created_at,
  a.message,
  a.severity
from public.admin_alerts a
where a.resolved_at is null;

-- Atualiza on_visit_status_change para gerar roteiro na confirmação
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
    perform public.generate_visit_itinerary(new.id);
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
    where visit_id = new.id and status = 'scheduled'
      and trigger in ('reminder.day_before', 'reminder.hour_before');
    perform public.schedule_visit_communications(new.id, 'visit.completed');
  end if;

  return new;
end;
$$;
