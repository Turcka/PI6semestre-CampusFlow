-- =============================================================================
-- 0014_visits_invitations.sql
-- Visitas, convocações, reencaminhamento e políticas (§3.5, §3.6, §3.12)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Colunas novas em visits
-- -----------------------------------------------------------------------------
alter table public.visits
  alter column promoter_id drop not null;

alter table public.visits
  add column if not exists professor_id uuid references public.profiles(id) on delete set null,
  add column if not exists professor_requirement public.professor_requirement not null default 'not_needed',
  add column if not exists match_run_id uuid references public.match_runs(id) on delete set null,
  add column if not exists focus public.visit_focus,
  add column if not exists rescheduled_from_id uuid references public.visits(id) on delete set null,
  add column if not exists promoter_briefing jsonb not null default '{}'::jsonb,
  add column if not exists outcome text,
  add column if not exists completed_at timestamptz,
  add column if not exists absent_marked_at timestamptz;

alter table public.calendar_events
  alter column promoter_id drop not null;

alter table public.calendar_events
  add column if not exists professor_id uuid references public.profiles(id) on delete set null;

create index if not exists visits_professor_idx on public.visits (professor_id) where professor_id is not null;
create index if not exists visits_match_run_idx on public.visits (match_run_id);

alter table public.visits drop constraint if exists visits_promoter_no_overlap;
alter table public.visits drop constraint if exists visits_professor_no_overlap;

alter table public.visits add constraint visits_promoter_no_overlap
  exclude using gist (promoter_id with =, period with &&)
  where (promoter_id is not null and status in ('agendada','aguardando_professor','confirmada','em_atendimento'));

alter table public.visits add constraint visits_professor_no_overlap
  exclude using gist (professor_id with =, period with &&)
  where (professor_id is not null and status in ('agendada','aguardando_professor','confirmada','em_atendimento'));

-- -----------------------------------------------------------------------------
-- Tabelas de convite / histórico / políticas
-- -----------------------------------------------------------------------------
create table public.visit_invitations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  visit_id         uuid not null references public.visits(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  role             public.participant_role not null,
  status           public.invitation_status not null default 'pending',
  match_result_id  uuid references public.match_results(id) on delete set null,
  rank             integer,
  sent_at          timestamptz not null default now(),
  expires_at       timestamptz not null,
  responded_at     timestamptz,
  decline_reason   text
);

create index visit_invitations_pending_expires_idx
  on public.visit_invitations (status, expires_at)
  where status = 'pending';

create index visit_invitations_profile_idx on public.visit_invitations (profile_id, status);
create index visit_invitations_visit_idx on public.visit_invitations (visit_id);

create table public.visit_reassignments (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  visit_id           uuid not null references public.visits(id) on delete cascade,
  role               public.participant_role not null,
  from_profile_id    uuid references public.profiles(id) on delete set null,
  to_profile_id      uuid references public.profiles(id) on delete set null,
  reason             public.reassignment_reason not null,
  match_run_id       uuid references public.match_runs(id) on delete set null,
  triggered_by       uuid references public.profiles(id) on delete set null,
  notified_candidate boolean not null default false,
  created_at         timestamptz not null default now()
);

create index visit_reassignments_visit_idx on public.visit_reassignments (visit_id, created_at desc);

create table public.visit_status_history (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references public.visits(id) on delete cascade,
  from_status  public.visit_status,
  to_status    public.visit_status not null,
  changed_by   uuid references public.profiles(id) on delete set null,
  reason       text,
  created_at   timestamptz not null default now()
);

create index visit_status_history_visit_idx on public.visit_status_history (visit_id, created_at);

create table public.visit_notes (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references public.visits(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  phase       public.note_phase not null default 'before',
  body        text not null,
  created_at  timestamptz not null default now()
);

create index visit_notes_visit_idx on public.visit_notes (visit_id, created_at);

create table public.scheduling_policies (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants(id) on delete cascade,
  focus                       public.visit_focus,
  min_hours_to_cancel         integer not null default 24,
  min_hours_to_reschedule     integer not null default 12,
  invitation_timeout_minutes  integer not null default 120,
  max_reassignments           integer not null default 3,
  default_duration_minutes    integer not null default 60,
  created_at                  timestamptz not null default now(),
  constraint scheduling_policies_tenant_focus_unique unique (tenant_id, focus)
);

-- Deduplicação de jobs
alter table public.message_jobs
  add column if not exists dedupe_key text;

create unique index if not exists message_jobs_visit_dedupe_unique
  on public.message_jobs (visit_id, dedupe_key)
  where status = 'scheduled' and dedupe_key is not null and visit_id is not null;

-- -----------------------------------------------------------------------------
-- Histórico de status
-- -----------------------------------------------------------------------------
create or replace function public.record_visit_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.visit_status_history (visit_id, from_status, to_status, reason)
    values (new.id, null, new.status, 'created');
  elsif new.status is distinct from old.status then
    insert into public.visit_status_history (visit_id, from_status, to_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_visits_status_history on public.visits;
create trigger trg_visits_status_history
after insert or update of status on public.visits
for each row execute function public.record_visit_status_history();

-- -----------------------------------------------------------------------------
-- Helpers de política / professor
-- -----------------------------------------------------------------------------
create or replace function public.get_scheduling_policy(p_tenant_id uuid, p_focus public.visit_focus default null)
returns public.scheduling_policies
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.scheduling_policies
  where tenant_id = p_tenant_id
    and (focus is not distinct from p_focus or focus is null)
  order by focus nulls last
  limit 1;
$$;

create or replace function public.resolve_professor_requirement(
  p_tenant_id uuid,
  p_course_id uuid,
  p_focus public.visit_focus,
  p_candidate_id uuid
)
returns public.professor_requirement
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_req public.professor_requirement := 'not_needed';
  v_rule record;
begin
  for v_rule in
    select *
    from public.professor_requirement_rules
    where tenant_id = p_tenant_id and is_active
      and (course_id is null or course_id = p_course_id)
      and (focus is null or focus = p_focus)
      and (
        interest_category_id is null
        or exists (
          select 1 from public.candidate_interests ci
          where ci.candidate_id = p_candidate_id and ci.category_id = interest_category_id
        )
      )
    order by priority asc, requirement desc
  loop
    return v_rule.requirement;
  end loop;
  return v_req;
end;
$$;

create or replace function public.find_available_professor(
  p_tenant_id uuid,
  p_course_id uuid,
  p_window tstzrange,
  p_prefer_substitute boolean default false
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  join public.professor_profiles pp on pp.profile_id = p.id
  where p.tenant_id = p_tenant_id
    and p.role = 'professor'
    and p.is_active
    and pp.accepts_visits
    and (not p_prefer_substitute or pp.is_substitute)
    and (
      p_course_id is null
      or exists (
        select 1 from public.professor_courses pc
        where pc.professor_id = p.id and pc.course_id = p_course_id
      )
    )
    and exists (
      select 1 from public.visit_slots s
      where s.owner_id = p.id
        and s.is_open
        and tstzrange(s.starts_at, s.ends_at, '[)') @> p_window
    )
    and not exists (
      select 1 from public.visits v
      where v.professor_id = p.id
        and v.status in ('agendada','aguardando_professor','confirmada','em_atendimento')
        and v.period && p_window
    )
  order by pp.is_substitute asc, p.full_name
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- schedule_visit_with_match
-- -----------------------------------------------------------------------------
create or replace function public.schedule_visit_with_match(
  p_candidate_id uuid,
  p_window tstzrange,
  p_requested_by uuid default null,
  p_prefer_promoter_id uuid default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.candidates%rowtype;
  v_slot      public.visit_slots%rowtype;
  v_run       public.match_runs%rowtype;
  v_result    public.match_results%rowtype;
  v_visit     public.visits%rowtype;
  v_policy    public.scheduling_policies%rowtype;
  v_req       public.professor_requirement;
  v_professor uuid;
  v_timeout   integer;
  v_status    public.visit_status;
begin
  select * into v_candidate from public.candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'CANDIDATE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_candidate.profile_completed_at is null then
    raise exception 'PROFILE_INCOMPLETE' using errcode = 'P0001';
  end if;

  select * into v_slot
  from public.visit_slots
  where is_open
    and booked_count < capacity
    and starts_at = lower(p_window)
    and ends_at = upper(p_window)
    and (
      p_prefer_promoter_id is null
      or owner_id = p_prefer_promoter_id
      or exists (
        select 1 from public.promoter_courses pc
        where pc.promoter_id = owner_id and pc.course_id = v_candidate.course_id
      )
    )
  order by case when owner_id = p_prefer_promoter_id then 0 else 1 end
  limit 1
  for update;

  if not found then
    -- qualquer slot exatamente na janela
    select * into v_slot
    from public.visit_slots
    where is_open and booked_count < capacity
      and starts_at = lower(p_window) and ends_at = upper(p_window)
    limit 1
    for update;
  end if;

  if not found then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_run := public.run_promoter_match(
    p_candidate_id,
    p_window,
    'initial',
    '{}',
    p_requested_by
  );

  if v_run.status = 'no_candidates' then
    raise exception 'NO_ELIGIBLE_PROMOTER' using errcode = 'P0001';
  end if;

  select * into v_result
  from public.match_results
  where run_id = v_run.id and is_selected
  limit 1;

  -- Preferir slot do promotor selecionado
  select * into v_slot
  from public.visit_slots
  where owner_id = v_result.promoter_id
    and is_open and booked_count < capacity
    and starts_at = lower(p_window) and ends_at = upper(p_window)
  for update;

  if not found then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_req := public.resolve_professor_requirement(
    v_candidate.tenant_id, v_candidate.course_id, v_candidate.preferred_focus, p_candidate_id
  );
  if v_req in ('required', 'recommended') then
    v_professor := public.find_available_professor(v_candidate.tenant_id, v_candidate.course_id, p_window, false);
  end if;

  v_policy := public.get_scheduling_policy(v_candidate.tenant_id, v_candidate.preferred_focus);
  v_timeout := coalesce(v_policy.invitation_timeout_minutes, 120);
  v_status := 'aguardando_promotor';

  insert into public.visits (
    tenant_id, candidate_id, slot_id, promoter_id, professor_id, campus_id, course_id,
    type, group_size, status, period, is_exclusive, focus, professor_requirement, match_run_id
  ) values (
    v_candidate.tenant_id, p_candidate_id, v_slot.id, v_result.promoter_id, v_professor,
    v_slot.campus_id, v_candidate.course_id,
    'individual', 1, v_status, p_window, true,
    v_candidate.preferred_focus, v_req, v_run.id
  )
  returning * into v_visit;

  update public.match_runs set visit_id = v_visit.id where id = v_run.id;

  update public.visit_slots set booked_count = booked_count + 1 where id = v_slot.id;

  update public.calendar_events
  set promoter_id = v_result.promoter_id, professor_id = v_professor
  where visit_id = v_visit.id;

  insert into public.visit_invitations (
    tenant_id, visit_id, profile_id, role, match_result_id, rank, expires_at
  ) values (
    v_visit.tenant_id, v_visit.id, v_result.promoter_id, 'promotor',
    v_result.id, 1, now() + make_interval(mins => v_timeout)
  );

  if v_professor is not null then
    insert into public.visit_invitations (
      tenant_id, visit_id, profile_id, role, expires_at
    ) values (
      v_visit.tenant_id, v_visit.id, v_professor, 'professor',
      now() + make_interval(mins => v_timeout)
    );
  end if;

  perform public.schedule_visit_communications(v_visit.id, 'promoter.invited');
  if v_professor is not null then
    perform public.schedule_visit_communications(v_visit.id, 'professor.requested');
  end if;

  return v_visit;
end;
$$;

-- -----------------------------------------------------------------------------
-- reassign_visit / respond_invitation
-- -----------------------------------------------------------------------------
create or replace function public.reassign_visit(
  p_visit_id uuid,
  p_role public.participant_role,
  p_reason public.reassignment_reason,
  p_actor uuid default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit     public.visits%rowtype;
  v_policy    public.scheduling_policies%rowtype;
  v_count     integer;
  v_next      public.match_results%rowtype;
  v_run       public.match_runs%rowtype;
  v_from      uuid;
  v_to        uuid;
  v_timeout   integer;
  v_notified  boolean := false;
begin
  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_policy := public.get_scheduling_policy(v_visit.tenant_id, v_visit.focus);
  select count(*) into v_count from public.visit_reassignments where visit_id = p_visit_id and role = p_role;
  if v_count >= coalesce(v_policy.max_reassignments, 3) then
    insert into public.admin_alerts (tenant_id, kind, visit_id, severity, message)
    values (v_visit.tenant_id, 'no_substitute', p_visit_id, 'critical',
            'Máximo de remanejamentos atingido para a visita ' || p_visit_id::text);
    perform public.schedule_visit_communications(p_visit_id, 'admin.no_substitute');
    return v_visit;
  end if;

  v_timeout := coalesce(v_policy.invitation_timeout_minutes, 120);

  if p_role = 'promotor' then
    v_from := v_visit.promoter_id;
    update public.visit_invitations set status = 'cancelled'
    where visit_id = p_visit_id and role = 'promotor' and status = 'pending';

    select * into v_next
    from public.match_results
    where run_id = v_visit.match_run_id
      and is_eligible
      and not is_selected
      and reserve_position is not null
      and promoter_id is distinct from v_from
      and not exists (
        select 1 from public.visits v
        where v.promoter_id = match_results.promoter_id
          and v.status in ('agendada','aguardando_professor','confirmada','em_atendimento')
          and v.period && v_visit.period
      )
    order by reserve_position
    limit 1;

    if not found then
      v_run := public.run_promoter_match(
        v_visit.candidate_id,
        v_visit.period,
        'reassignment',
        array(select coalesce(from_profile_id, to_profile_id) from public.visit_reassignments where visit_id = p_visit_id)
          || array[v_from],
        p_actor
      );
      update public.match_runs set visit_id = p_visit_id where id = v_run.id;
      update public.visits set match_run_id = v_run.id where id = p_visit_id;
      select * into v_next from public.match_results where run_id = v_run.id and is_selected limit 1;
    end if;

    if v_next.promoter_id is null then
      update public.visits set promoter_id = null, status = 'aguardando_promotor' where id = p_visit_id returning * into v_visit;
      insert into public.visit_reassignments (
        tenant_id, visit_id, role, from_profile_id, to_profile_id, reason, triggered_by
      ) values (v_visit.tenant_id, p_visit_id, 'promotor', v_from, null, p_reason, p_actor);
      insert into public.admin_alerts (tenant_id, kind, visit_id, severity, message)
      values (v_visit.tenant_id, 'no_substitute', p_visit_id, 'critical', 'Sem promotor substituto disponível.');
      perform public.schedule_visit_communications(p_visit_id, 'admin.no_substitute');
      return v_visit;
    end if;

    v_to := v_next.promoter_id;
    update public.visits
    set promoter_id = v_to, status = 'aguardando_promotor'
    where id = p_visit_id
    returning * into v_visit;

    update public.calendar_events set promoter_id = v_to where visit_id = p_visit_id;

    insert into public.visit_invitations (
      tenant_id, visit_id, profile_id, role, match_result_id, rank, expires_at
    ) values (
      v_visit.tenant_id, p_visit_id, v_to, 'promotor', v_next.id, coalesce(v_next.rank, 1),
      now() + make_interval(mins => v_timeout)
    );

    v_notified := true;
    perform public.schedule_visit_communications(p_visit_id, 'promoter.invited');
    perform public.schedule_visit_communications(p_visit_id, 'promoter.reassigned');

  else
    v_from := v_visit.professor_id;
    update public.visit_invitations set status = 'cancelled'
    where visit_id = p_visit_id and role = 'professor' and status = 'pending';

    v_to := public.find_available_professor(v_visit.tenant_id, v_visit.course_id, v_visit.period, true);
    if v_to is null then
      update public.visits set professor_id = null
      where id = p_visit_id
      returning * into v_visit;
      if v_visit.professor_requirement = 'required' then
        insert into public.admin_alerts (tenant_id, kind, visit_id, severity, message)
        values (v_visit.tenant_id, 'professor_required_missing', p_visit_id, 'critical',
                'Professor obrigatório indisponível e sem substituto.');
      end if;
      insert into public.visit_reassignments (
        tenant_id, visit_id, role, from_profile_id, to_profile_id, reason, triggered_by
      ) values (v_visit.tenant_id, p_visit_id, 'professor', v_from, null, p_reason, p_actor);
      return v_visit;
    end if;

    update public.visits set professor_id = v_to where id = p_visit_id returning * into v_visit;
    update public.calendar_events set professor_id = v_to where visit_id = p_visit_id;
    insert into public.visit_invitations (
      tenant_id, visit_id, profile_id, role, expires_at
    ) values (
      v_visit.tenant_id, p_visit_id, v_to, 'professor', now() + make_interval(mins => v_timeout)
    );
    perform public.schedule_visit_communications(p_visit_id, 'professor.requested');
  end if;

  insert into public.visit_reassignments (
    tenant_id, visit_id, role, from_profile_id, to_profile_id, reason, match_run_id, triggered_by, notified_candidate
  ) values (
    v_visit.tenant_id, p_visit_id, p_role, v_from, v_to, p_reason, v_visit.match_run_id, p_actor, v_notified
  );

  return v_visit;
end;
$$;

create or replace function public.respond_invitation(
  p_invitation_id uuid,
  p_accept boolean,
  p_reason text default null,
  p_actor_id uuid default auth.uid()
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv   public.visit_invitations%rowtype;
  v_visit public.visits%rowtype;
  v_pending_prof boolean;
begin
  select * into v_inv from public.visit_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING' using errcode = 'P0001';
  end if;
  if p_actor_id is not null
     and p_actor_id <> v_inv.profile_id
     and not public.has_role('admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not p_accept then
    update public.visit_invitations
    set status = case when p_reason = 'expired' then 'expired'::public.invitation_status else 'declined'::public.invitation_status end,
        responded_at = now(),
        decline_reason = p_reason
    where id = p_invitation_id;
    return public.reassign_visit(
      v_inv.visit_id,
      v_inv.role,
      case when p_reason = 'expired' then 'expired'::public.reassignment_reason else 'declined'::public.reassignment_reason end,
      p_actor_id
    );
  end if;

  update public.visit_invitations
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  select * into v_visit from public.visits where id = v_inv.visit_id for update;

  if v_inv.role = 'promotor' then
    select exists (
      select 1 from public.visit_invitations
      where visit_id = v_inv.visit_id and role = 'professor' and status = 'pending'
    ) into v_pending_prof;

    if v_pending_prof then
      update public.visits set status = 'aguardando_professor' where id = v_visit.id returning * into v_visit;
    else
      update public.visits set status = 'confirmada' where id = v_visit.id returning * into v_visit;
      update public.calendar_events
      set confirmed_at = now(), confirmed_by = p_actor_id
      where visit_id = v_visit.id;
    end if;
  else
    -- professor
    if exists (
      select 1 from public.visit_invitations
      where visit_id = v_inv.visit_id and role = 'promotor' and status = 'accepted'
    ) then
      update public.visits set status = 'confirmada' where id = v_visit.id returning * into v_visit;
      update public.calendar_events
      set confirmed_at = now(), confirmed_by = p_actor_id
      where visit_id = v_visit.id;
    end if;
  end if;

  return v_visit;
end;
$$;

create or replace function public.expire_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_count integer := 0;
begin
  for v_inv in
    select id from public.visit_invitations
    where status = 'pending' and expires_at <= now()
    order by expires_at
    limit 100
  loop
    perform public.respond_invitation(v_inv.id, false, 'expired', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel / reschedule / set_status / assign_manual / last_minute
-- -----------------------------------------------------------------------------
drop function if exists public.cancel_visit(uuid, text);

create or replace function public.cancel_visit(
  p_visit_id uuid,
  p_actor uuid default null,
  p_reason text default null,
  p_override boolean default false
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit  public.visits%rowtype;
  v_policy public.scheduling_policies%rowtype;
begin
  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_visit.status in ('cancelada', 'realizada', 'ausente', 'reagendada') then
    raise exception 'VISIT_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  if not p_override then
    v_policy := public.get_scheduling_policy(v_visit.tenant_id, v_visit.focus);
    if lower(v_visit.period) < now() + make_interval(hours => coalesce(v_policy.min_hours_to_cancel, 24)) then
      raise exception 'CANCEL_TOO_LATE' using errcode = 'P0001';
    end if;
  end if;

  update public.visits
  set status = 'cancelada', cancelled_at = now(), cancel_reason = p_reason
  where id = p_visit_id
  returning * into v_visit;

  update public.visit_invitations set status = 'cancelled'
  where visit_id = p_visit_id and status = 'pending';

  update public.message_jobs set status = 'cancelled'
  where visit_id = p_visit_id and status = 'scheduled';

  update public.visit_slots
  set booked_count = greatest(booked_count - v_visit.group_size, 0)
  where id = v_visit.slot_id;

  return v_visit;
end;
$$;

create or replace function public.reschedule_visit(
  p_visit_id uuid,
  p_new_window tstzrange,
  p_actor uuid default null,
  p_override boolean default false
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    public.visits%rowtype;
  v_new    public.visits%rowtype;
  v_policy public.scheduling_policies%rowtype;
begin
  select * into v_old from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not p_override then
    v_policy := public.get_scheduling_policy(v_old.tenant_id, v_old.focus);
    if lower(v_old.period) < now() + make_interval(hours => coalesce(v_policy.min_hours_to_reschedule, 12)) then
      raise exception 'RESCHEDULE_TOO_LATE' using errcode = 'P0001';
    end if;
  end if;

  update public.visits set status = 'reagendada' where id = p_visit_id;
  update public.visit_invitations set status = 'cancelled' where visit_id = p_visit_id and status = 'pending';
  update public.message_jobs set status = 'cancelled' where visit_id = p_visit_id and status = 'scheduled';
  update public.visit_slots
  set booked_count = greatest(booked_count - v_old.group_size, 0)
  where id = v_old.slot_id;

  v_new := public.schedule_visit_with_match(
    v_old.candidate_id, p_new_window, p_actor, v_old.promoter_id
  );

  update public.visits set rescheduled_from_id = p_visit_id where id = v_new.id returning * into v_new;
  return v_new;
end;
$$;

create or replace function public.set_visit_status(
  p_visit_id uuid,
  p_status public.visit_status,
  p_actor uuid default null,
  p_reason text default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits%rowtype;
  v_is_admin boolean;
begin
  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_is_admin := coalesce(public.has_role('admin'), false)
    or exists (select 1 from public.profiles where id = p_actor and role = 'admin');

  if not v_is_admin then
    if p_actor is distinct from v_visit.promoter_id then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if not (
      (v_visit.status = 'confirmada' and p_status in ('em_atendimento', 'ausente'))
      or (v_visit.status = 'em_atendimento' and p_status = 'realizada')
    ) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
  end if;

  update public.visits
  set
    status = p_status,
    completed_at = case when p_status = 'realizada' then now() else completed_at end,
    absent_marked_at = case when p_status = 'ausente' then now() else absent_marked_at end,
    outcome = coalesce(p_reason, outcome)
  where id = p_visit_id
  returning * into v_visit;

  return v_visit;
end;
$$;

create or replace function public.assign_visit_manually(
  p_visit_id uuid,
  p_role public.participant_role,
  p_profile_id uuid,
  p_actor uuid
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits%rowtype;
  v_from  uuid;
  v_policy public.scheduling_policies%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  v_policy := public.get_scheduling_policy(v_visit.tenant_id, v_visit.focus);

  if p_role = 'promotor' then
    v_from := v_visit.promoter_id;
    update public.visits set promoter_id = p_profile_id, status = 'aguardando_promotor'
    where id = p_visit_id returning * into v_visit;
    update public.calendar_events set promoter_id = p_profile_id where visit_id = p_visit_id;
    update public.visit_invitations set status = 'cancelled'
    where visit_id = p_visit_id and role = 'promotor' and status = 'pending';
    insert into public.visit_invitations (tenant_id, visit_id, profile_id, role, expires_at)
    values (
      v_visit.tenant_id, p_visit_id, p_profile_id, 'promotor',
      now() + make_interval(mins => coalesce(v_policy.invitation_timeout_minutes, 120))
    );
  else
    v_from := v_visit.professor_id;
    update public.visits set professor_id = p_profile_id where id = p_visit_id returning * into v_visit;
    update public.calendar_events set professor_id = p_profile_id where visit_id = p_visit_id;
    update public.visit_invitations set status = 'cancelled'
    where visit_id = p_visit_id and role = 'professor' and status = 'pending';
    insert into public.visit_invitations (tenant_id, visit_id, profile_id, role, expires_at)
    values (
      v_visit.tenant_id, p_visit_id, p_profile_id, 'professor',
      now() + make_interval(mins => coalesce(v_policy.invitation_timeout_minutes, 120))
    );
  end if;

  insert into public.visit_reassignments (
    tenant_id, visit_id, role, from_profile_id, to_profile_id, reason, triggered_by
  ) values (
    v_visit.tenant_id, p_visit_id, p_role, v_from, p_profile_id, 'admin', p_actor
  );

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
  values (
    v_visit.tenant_id, p_actor, 'visit.assign_manual', 'visits', p_visit_id::text,
    jsonb_build_object('role', p_role, 'from', v_from, 'to', p_profile_id)
  );

  return v_visit;
end;
$$;

create or replace function public.handle_last_minute_unavailability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
begin
  if new.kind <> 'last_minute' then
    return new;
  end if;

  for v_visit in
    select id, case
      when promoter_id = new.owner_id then 'promotor'::public.participant_role
      when professor_id = new.owner_id then 'professor'::public.participant_role
    end as role
    from public.visits
    where status in ('agendada','aguardando_promotor','aguardando_professor','confirmada')
      and period && new.period
      and (promoter_id = new.owner_id or professor_id = new.owner_id)
  loop
    perform public.reassign_visit(v_visit.id, v_visit.role, 'last_minute', null);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_availability_last_minute on public.availability_exceptions;
create trigger trg_availability_last_minute
after insert on public.availability_exceptions
for each row execute function public.handle_last_minute_unavailability();

-- decline_calendar_event usa nova assinatura de cancel_visit
create or replace function public.decline_calendar_event(
  p_event_id uuid,
  p_reason text default null,
  p_actor_id uuid default auth.uid()
)
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

  perform public.cancel_visit(v_event.visit_id, p_actor_id, coalesce(p_reason, 'Recusada'), true);
  return v_event;
end;
$$;
