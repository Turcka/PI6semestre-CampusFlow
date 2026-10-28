-- =============================================================================
-- 0020_promoter_guards.sql — Sprint 1 / E5
-- Travas do promotor: maioridade, foto, onboarding/teste comportamental (6 meses)
-- e limite de 1 visita por dia.
--   * profiles.birth_date + trigger check_promoter_adult
--   * promoter_profiles.onboarding_* / behavioral_test_* / max_visits_per_day = 1
--   * promoter_is_eligible(), promoter_eligibility_missing(), vw_promoter_eligibility
--   * trigger enforce_promoter_daily_limit em visits
--   * run_promoter_match / assign_visit_manually respeitam as travas
--   * build_promoter_profile grava onboarding + validade do teste + foco
--   * bucket "avatars" com políticas por pasta do usuário
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Colunas
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists birth_date date;

alter table public.promoter_profiles
  add column if not exists onboarding_completed_at      timestamptz,
  add column if not exists behavioral_test_completed_at timestamptz,
  add column if not exists behavioral_test_expires_at   timestamptz,
  add column if not exists onboarding_session_id        uuid references public.chatbot_sessions(id) on delete set null;

-- Regra de negócio: 1 visita por dia por promotor (ajustável pelo admin até 20).
alter table public.promoter_profiles alter column max_visits_per_day set default 1;
update public.promoter_profiles set max_visits_per_day = 1 where max_visits_per_day <> 1;

-- -----------------------------------------------------------------------------
-- 2) Maioridade: promotor com birth_date informado precisa ter 18+
-- -----------------------------------------------------------------------------
create or replace function public.check_promoter_adult()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'promotor' and new.birth_date is not null
     and new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'PROMOTER_UNDERAGE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_check_promoter_adult on public.profiles;
create trigger trg_profiles_check_promoter_adult
before insert or update of role, birth_date on public.profiles
for each row execute function public.check_promoter_adult();

-- handle_new_auth_user: lê birth_date dos metadados do convite/criação
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

  insert into public.profiles (id, tenant_id, full_name, email, phone, role, birth_date)
  values (
    new.id,
    v_tenant_id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    v_role,
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date
  )
  on conflict (id) do nothing;

  if v_role = 'promotor' then
    insert into public.promoter_profiles (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  elsif v_role = 'professor' then
    insert into public.professor_profiles (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Elegibilidade do promotor (regra única, usada por match, escalação e UI)
-- -----------------------------------------------------------------------------
create or replace function public.promoter_eligibility_missing(p_profile_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_remove(array[
    case when not p.is_active then 'inactive' end,
    case when p.is_banned then 'banned' end,
    case when p.birth_date is null then 'birth_date' end,
    case when p.birth_date is not null
          and p.birth_date > (current_date - interval '18 years')::date then 'underage' end,
    case when nullif(p.avatar_url, '') is null then 'avatar' end,
    case when pp.onboarding_completed_at is null then 'onboarding' end,
    case when pp.behavioral_test_expires_at is null then 'behavioral_test' end,
    case when pp.behavioral_test_expires_at is not null
          and pp.behavioral_test_expires_at <= now() then 'behavioral_test_expired' end
  ], null), '{}'::text[])
  from public.profiles p
  left join public.promoter_profiles pp on pp.profile_id = p.id
  where p.id = p_profile_id and p.role = 'promotor';
$$;

create or replace function public.promoter_is_eligible(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cardinality(public.promoter_eligibility_missing(p_profile_id)) = 0, false)
    and exists (select 1 from public.profiles where id = p_profile_id and role = 'promotor');
$$;

create or replace view public.vw_promoter_eligibility
with (security_invoker = true) as
select
  p.id as profile_id,
  p.tenant_id,
  public.promoter_eligibility_missing(p.id) as missing,
  cardinality(public.promoter_eligibility_missing(p.id)) = 0 as eligible,
  pp.onboarding_completed_at,
  pp.behavioral_test_expires_at,
  pp.max_visits_per_day
from public.profiles p
left join public.promoter_profiles pp on pp.profile_id = p.id
where p.role = 'promotor';

-- -----------------------------------------------------------------------------
-- 4) Limite diário por promotor (dia no fuso do tenant)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_promoter_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_max   integer;
  v_day   date;
  v_count integer;
begin
  if new.promoter_id is null
     or new.status not in ('agendada','aguardando_promotor','aguardando_professor','confirmada','em_atendimento') then
    return new;
  end if;

  -- só revalida quando algo relevante mudou
  if tg_op = 'UPDATE'
     and new.promoter_id is not distinct from old.promoter_id
     and new.period = old.period
     and (old.status in ('agendada','aguardando_promotor','aguardando_professor','confirmada','em_atendimento')) then
    return new;
  end if;

  select coalesce(t.timezone, 'America/Sao_Paulo') into v_tz
  from public.tenants t where t.id = new.tenant_id;

  select coalesce(pp.max_visits_per_day, 1) into v_max
  from public.promoter_profiles pp where pp.profile_id = new.promoter_id;
  v_max := coalesce(v_max, 1);

  v_day := (lower(new.period) at time zone v_tz)::date;

  select count(*) into v_count
  from public.visits v
  where v.promoter_id = new.promoter_id
    and v.id <> new.id
    and v.status in ('agendada','aguardando_promotor','aguardando_professor','confirmada','em_atendimento')
    and (lower(v.period) at time zone v_tz)::date = v_day;

  if v_count >= v_max then
    raise exception 'PROMOTER_DAILY_LIMIT' using errcode = 'P0001',
      hint = format('Limite de %s visita(s) por dia atingido em %s.', v_max, to_char(v_day, 'DD/MM/YYYY'));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_visits_promoter_daily_limit on public.visits;
create trigger trg_visits_promoter_daily_limit
before insert or update of promoter_id, period, status on public.visits
for each row execute function public.enforce_promoter_daily_limit();

-- -----------------------------------------------------------------------------
-- 5) assign_visit_manually: promotor precisa estar apto
-- -----------------------------------------------------------------------------
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
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active and not is_banned) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not public.profile_can_be_assigned(p_profile_id) then
    raise exception 'PROFILE_NOT_ASSIGNABLE' using errcode = 'P0001';
  end if;

  if p_role = 'promotor' and not public.promoter_is_eligible(p_profile_id) then
    raise exception 'PROMOTER_NOT_ELIGIBLE' using errcode = 'P0001',
      hint = array_to_string(public.promoter_eligibility_missing(p_profile_id), ', ');
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = 'P0002';
  end if;
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

-- -----------------------------------------------------------------------------
-- 6) run_promoter_match: não banido, apto e abaixo do limite diário
--    (corpo de 0018 + filtros; max_visits_per_day deixa de ser só desempate)
-- -----------------------------------------------------------------------------
create or replace function public.run_promoter_match(
  p_candidate_id uuid,
  p_window tstzrange,
  p_trigger text default 'initial',
  p_exclude_promoters uuid[] default '{}',
  p_requested_by uuid default null,
  p_min_compatibility numeric default null
)
returns public.match_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate    public.candidates%rowtype;
  v_run          public.match_runs%rowtype;
  v_promoter     record;
  v_weights      record;
  v_breakdown    jsonb;
  v_raw          numeric;
  v_weighted_sum numeric;
  v_weight_sum   numeric;
  v_score        numeric;
  v_eligible     boolean;
  v_reason       text;
  v_results      jsonb := '[]'::jsonb;
  v_shared       text[];
  v_rank         integer := 0;
  v_tz           text;
  v_day          date;
  v_workload     numeric;
  v_visits_day   integer;
  v_min_compat   numeric;
  v_item         jsonb;
begin
  select * into v_candidate from public.candidates where id = p_candidate_id;
  if not found then
    raise exception 'CANDIDATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_min_compat := coalesce(p_min_compatibility, 0.50);

  insert into public.match_runs (
    tenant_id, candidate_id, requested_window, course_id, trigger, requested_by, min_compatibility
  ) values (
    v_candidate.tenant_id, p_candidate_id, p_window, v_candidate.course_id,
    p_trigger::public.match_run_trigger, p_requested_by, v_min_compat
  )
  returning * into v_run;

  select coalesce(t.timezone, 'America/Sao_Paulo') into v_tz
  from public.tenants t where t.id = v_candidate.tenant_id;
  v_day := (lower(p_window) at time zone v_tz)::date;

  for v_promoter in
    select
      p.id as promoter_id, p.full_name, pp.traits, pp.preferred_focus,
      pp.experience_level, pp.max_visits_per_day, pp.rating_avg
    from public.profiles p
    join public.promoter_profiles pp on pp.profile_id = p.id
    where p.tenant_id = v_candidate.tenant_id
      and p.role = 'promotor'
      and p.is_active
      and not p.is_banned
      and pp.accepts_auto_match
      and public.promoter_is_eligible(p.id)
      and not (p.id = any (p_exclude_promoters))
      and exists (
        select 1 from public.visit_slots s
        where s.owner_id = p.id
          and s.is_open
          and s.booked_count < s.capacity
          and s.starts_at = lower(p_window)
          and s.ends_at = upper(p_window)
      )
      and not exists (
        select 1 from public.visits v
        where v.promoter_id = p.id
          and v.status in ('agendada', 'aguardando_promotor', 'aguardando_professor', 'confirmada', 'em_atendimento')
          and v.period && p_window
      )
      and (
        select count(*) from public.visits v
        where v.promoter_id = p.id
          and v.status in ('agendada', 'aguardando_promotor', 'aguardando_professor', 'confirmada', 'em_atendimento')
          and (lower(v.period) at time zone v_tz)::date = v_day
      ) < pp.max_visits_per_day
      and (
        v_candidate.course_id is null
        or exists (
          select 1 from public.promoter_courses pc
          where pc.promoter_id = p.id and pc.course_id = v_candidate.course_id
        )
      )
  loop
    v_breakdown := '{}'::jsonb;
    v_weighted_sum := 0;
    v_weight_sum := 0;
    v_eligible := true;
    v_reason := null;

    select count(*) into v_visits_day
    from public.visits v
    where v.promoter_id = v_promoter.promoter_id
      and v.status in ('agendada', 'aguardando_promotor', 'aguardando_professor', 'confirmada', 'em_atendimento')
      and (lower(v.period) at time zone v_tz)::date = v_day;

    v_workload := greatest(0::numeric, 1 - (v_visits_day::numeric / nullif(v_promoter.max_visits_per_day, 0)));

    for v_weights in
      select * from public.match_weights
      where tenant_id = v_candidate.tenant_id and is_active and kind <> 'tiebreaker'
      order by criterion
    loop
      v_raw := case v_weights.criterion
        when 'course_affinity' then public._match_course_affinity(v_promoter.promoter_id, v_candidate.course_id)
        when 'interest_overlap' then public._match_interest_overlap(p_candidate_id, v_promoter.promoter_id)
        when 'behavioral_similarity' then public._match_behavioral_similarity(
          v_candidate.behavioral_profile, v_promoter.traits
        )
        when 'focus_alignment' then case
          when v_candidate.preferred_focus is null then 0.5
          when v_candidate.preferred_focus = any (v_promoter.preferred_focus) then 1
          else 0.2
        end
        when 'service_experience' then v_promoter.experience_level / 5.0
        when 'workload_balance' then coalesce(v_workload, 0.5)
        when 'rating' then case
          when v_promoter.rating_avg is null then null
          else least(1::numeric, v_promoter.rating_avg / 5.0)
        end
        else 0
      end;

      if v_raw is null then
        continue;
      end if;

      if v_weights.kind = 'mandatory'
         and v_weights.min_score is not null
         and v_raw < v_weights.min_score then
        v_eligible := false;
        v_reason := 'Critério obrigatório abaixo do mínimo: ' || v_weights.criterion;
      end if;

      v_breakdown := jsonb_set(
        v_breakdown,
        array[v_weights.criterion],
        jsonb_build_object('raw', v_raw, 'weight', v_weights.weight, 'weighted', v_raw * v_weights.weight)
      );
      v_weighted_sum := v_weighted_sum + (v_raw * v_weights.weight);
      v_weight_sum := v_weight_sum + v_weights.weight;
    end loop;

    v_score := case when v_weight_sum = 0 then 0 else v_weighted_sum / v_weight_sum end;

    if v_eligible and v_score < v_min_compat then
      v_eligible := false;
      v_reason := 'Compatibilidade abaixo do mínimo (' || round(v_min_compat * 100)::text || '%)';
    end if;

    select array_agg(ic.slug) into v_shared
    from public.candidate_interests ci
    join public.promoter_interests pi
      on pi.category_id = ci.category_id and pi.promoter_id = v_promoter.promoter_id
    join public.interest_categories ic on ic.id = ci.category_id
    where ci.candidate_id = p_candidate_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'promoter_id', v_promoter.promoter_id,
      'score', v_score,
      'breakdown', v_breakdown,
      'is_eligible', v_eligible,
      'ineligibility_reason', v_reason,
      'justification', public._match_build_justification(v_score, v_breakdown, v_shared),
      'workload', v_workload,
      'experience', v_promoter.experience_level
    ));
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(v_results) value
    where (value ->> 'is_eligible')::boolean
    order by (value ->> 'score')::numeric desc,
             (value ->> 'workload')::numeric desc,
             (value ->> 'experience')::int desc
  loop
    v_rank := v_rank + 1;
    insert into public.match_results (
      run_id, promoter_id, score, rank, breakdown, justification,
      is_eligible, is_selected, reserve_position
    ) values (
      v_run.id,
      (v_item ->> 'promoter_id')::uuid,
      (v_item ->> 'score')::numeric,
      v_rank,
      v_item -> 'breakdown',
      v_item ->> 'justification',
      true,
      v_rank = 1,
      case when v_rank = 1 then null else v_rank - 1 end
    );
  end loop;

  for v_item in
    select value from jsonb_array_elements(v_results) value
    where not (value ->> 'is_eligible')::boolean
  loop
    insert into public.match_results (
      run_id, promoter_id, score, rank, breakdown, justification,
      is_eligible, ineligibility_reason, is_selected
    ) values (
      v_run.id,
      (v_item ->> 'promoter_id')::uuid,
      (v_item ->> 'score')::numeric,
      9999,
      v_item -> 'breakdown',
      v_item ->> 'justification',
      false,
      v_item ->> 'ineligibility_reason',
      false
    );
  end loop;

  if v_rank = 0 then
    update public.match_runs set status = 'no_candidates' where id = v_run.id returning * into v_run;
    insert into public.admin_alerts (tenant_id, kind, severity, message)
    values (
      v_candidate.tenant_id, 'no_substitute', 'critical',
      'Nenhum promotor elegível para o candidato ' || v_candidate.full_name || ' na janela solicitada.'
    );
  else
    select * into v_run from public.match_runs where id = v_run.id;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
  values (
    v_candidate.tenant_id, p_requested_by, 'match.run', 'match_runs', v_run.id::text,
    jsonb_build_object('status', v_run.status, 'eligible_count', v_rank, 'trigger', p_trigger)
  );

  return v_run;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) build_promoter_profile: conclui onboarding, valida teste por 6 meses, foco
-- -----------------------------------------------------------------------------
create or replace function public.build_promoter_profile(p_session_id uuid)
returns public.promoter_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session  public.chatbot_sessions%rowtype;
  v_profile  public.promoter_profiles%rowtype;
  v_answer   record;
  v_option   jsonb;
  v_traits   jsonb := '{}'::jsonb;
  v_selected jsonb;
  v_trait_key text;
  v_delta     numeric;
  v_interest  text;
  v_cat_id    uuid;
  v_focus     public.visit_focus[] := '{}';
  v_focus_txt text;
begin
  select * into v_session from public.chatbot_sessions where id = p_session_id;
  if not found or v_session.audience <> 'promotor' or v_session.profile_id is null then
    raise exception 'SESSION_NOT_PROMOTER' using errcode = 'P0001';
  end if;

  insert into public.promoter_profiles (profile_id)
  values (v_session.profile_id)
  on conflict do nothing;

  -- começa do zero a cada conclusão (refazer o teste substitui o anterior)
  delete from public.promoter_interests where promoter_id = v_session.profile_id;

  for v_answer in
    select a.value, q.options, q.kind
    from public.chatbot_answers a
    join public.chatbot_questions q on q.id = a.question_id
    where a.session_id = p_session_id
  loop
    if v_answer.kind = 'multi_choice' then
      v_selected := coalesce(v_answer.value -> 'values', v_answer.value);
      if jsonb_typeof(v_selected) <> 'array' then
        v_selected := jsonb_build_array(v_answer.value ->> 'value');
      end if;
    else
      v_selected := jsonb_build_array(coalesce(v_answer.value ->> 'value', v_answer.value #>> '{}'));
    end if;

    for v_option in
      select opt from jsonb_array_elements(v_answer.options) opt
      where opt ->> 'value' in (select jsonb_array_elements_text(v_selected))
    loop
      if v_option ? 'traits' then
        for v_trait_key, v_delta in
          select key, value::text::numeric from jsonb_each_text(v_option -> 'traits')
        loop
          v_traits := jsonb_set(
            v_traits,
            array[v_trait_key],
            to_jsonb(least(1::numeric, greatest(0::numeric,
              coalesce((v_traits ->> v_trait_key)::numeric, 0) + v_delta
            )))
          );
        end loop;
      end if;

      if v_option ? 'interests' then
        for v_interest in select jsonb_array_elements_text(v_option -> 'interests')
        loop
          select id into v_cat_id from public.interest_categories
          where tenant_id = v_session.tenant_id and slug = v_interest limit 1;
          if v_cat_id is not null then
            insert into public.promoter_interests (promoter_id, category_id, level)
            values (v_session.profile_id, v_cat_id, 3)
            on conflict (promoter_id, category_id) do update set level = least(5, public.promoter_interests.level + 1);
          end if;
        end loop;
      end if;

      if v_option ? 'focus' then
        v_focus_txt := v_option ->> 'focus';
        if v_focus_txt is not null
           and v_focus_txt = any (enum_range(null::public.visit_focus)::text[])
           and not (v_focus_txt::public.visit_focus = any (v_focus)) then
          v_focus := v_focus || v_focus_txt::public.visit_focus;
        end if;
      end if;
    end loop;
  end loop;

  update public.promoter_profiles
  set traits = v_traits,
      preferred_focus = case when cardinality(v_focus) > 0 then v_focus else preferred_focus end,
      onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      behavioral_test_completed_at = now(),
      behavioral_test_expires_at = now() + interval '6 months',
      onboarding_session_id = p_session_id,
      updated_at = now()
  where profile_id = v_session.profile_id
  returning * into v_profile;

  update public.chatbot_sessions
  set status = 'completed', completed_at = now()
  where id = p_session_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
  values (
    v_session.tenant_id, v_session.profile_id, 'promoter.onboarding_completed', 'promoter_profiles',
    v_session.profile_id::text,
    jsonb_build_object('session_id', p_session_id, 'test_expires_at', v_profile.behavioral_test_expires_at)
  );

  return v_profile;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) Bucket público "avatars": cada usuário escreve só em <uid>/...
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars owner write" on storage.objects;
create policy "avatars owner write" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars admin write" on storage.objects;
create policy "avatars admin write" on storage.objects for all
  using (bucket_id = 'avatars' and public.has_role('admin'))
  with check (bucket_id = 'avatars' and public.has_role('admin'));

comment on column public.profiles.birth_date is 'Data de nascimento; promotores precisam ter 18+ (trigger check_promoter_adult).';
comment on column public.promoter_profiles.behavioral_test_expires_at is 'Teste comportamental vale 6 meses; vencido, o promotor sai do match até refazer.';
