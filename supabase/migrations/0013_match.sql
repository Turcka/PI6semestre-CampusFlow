-- =============================================================================
-- 0013_match.sql
-- Motor de match candidato × promotor (§3.4, §7)
-- =============================================================================

create table public.match_weights (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  criterion   text not null,
  weight      numeric(5,2) not null default 0 check (weight >= 0),
  kind        public.match_criterion_kind not null default 'complementary',
  min_score   numeric(4,3),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint match_weights_tenant_criterion_unique unique (tenant_id, criterion),
  constraint match_weights_criterion_check check (criterion in (
    'course_affinity', 'interest_overlap', 'behavioral_similarity',
    'focus_alignment', 'service_experience', 'workload_balance', 'rating'
  ))
);

create table public.admin_alerts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  kind         public.alert_kind not null,
  visit_id     uuid references public.visits(id) on delete set null,
  severity     public.alert_severity not null default 'warning',
  message      text not null,
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index admin_alerts_tenant_open_idx
  on public.admin_alerts (tenant_id, created_at desc)
  where resolved_at is null;

create table public.match_runs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  candidate_id        uuid not null references public.candidates(id) on delete cascade,
  visit_id            uuid references public.visits(id) on delete set null,
  requested_window    tstzrange not null,
  course_id           uuid references public.courses(id) on delete set null,
  trigger             public.match_run_trigger not null default 'initial',
  requested_by        uuid references public.profiles(id) on delete set null,
  min_compatibility   numeric(4,3) not null default 0.50,
  status              public.match_run_status not null default 'completed',
  created_at          timestamptz not null default now()
);

create index match_runs_candidate_idx on public.match_runs (candidate_id, created_at desc);
create index match_runs_tenant_idx on public.match_runs (tenant_id, created_at desc);

create table public.match_results (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references public.match_runs(id) on delete cascade,
  promoter_id           uuid not null references public.profiles(id) on delete cascade,
  score                 numeric(5,4) not null check (score >= 0 and score <= 1),
  rank                  integer not null,
  breakdown             jsonb not null default '{}'::jsonb,
  justification         text,
  is_eligible           boolean not null default true,
  ineligibility_reason  text,
  is_selected           boolean not null default false,
  reserve_position      integer,
  constraint match_results_run_promoter_unique unique (run_id, promoter_id)
);

create index match_results_run_rank_idx on public.match_results (run_id, rank);

-- -----------------------------------------------------------------------------
-- Helpers de scoring
-- -----------------------------------------------------------------------------
create or replace function public._match_course_affinity(p_promoter_id uuid, p_course_id uuid)
returns numeric
language sql
stable
as $$
  select case
    when p_course_id is null then 0.5
    when exists (
      select 1 from public.promoter_courses pc
      where pc.promoter_id = p_promoter_id and pc.course_id = p_course_id
    ) then least(1::numeric, (
      select familiarity / 5.0 from public.promoter_courses
      where promoter_id = p_promoter_id and course_id = p_course_id
    ))
    else 0
  end;
$$;

create or replace function public._match_interest_overlap(p_candidate_id uuid, p_promoter_id uuid)
returns numeric
language sql
stable
as $$
  with cand as (
    select category_id, score from public.candidate_interests where candidate_id = p_candidate_id
  ),
  prom as (
    select category_id, level / 5.0 as score from public.promoter_interests where promoter_id = p_promoter_id
  ),
  joined as (
    select c.score as cs, p.score as ps
    from cand c join prom p on p.category_id = c.category_id
  )
  select case
    when (select count(*) from cand) = 0 and (select count(*) from prom) = 0 then 0.5
    when (select count(*) from cand) = 0 or (select count(*) from prom) = 0 then 0
    else coalesce(
      (select sum(least(cs, ps)) from joined)
      / nullif((select count(*) from cand)::numeric, 0),
      0
    )
  end;
$$;

create or replace function public._match_behavioral_similarity(p_candidate_traits jsonb, p_promoter_traits jsonb)
returns numeric
language plpgsql
stable
as $$
declare
  v_key text;
  v_sum numeric := 0;
  v_n   integer := 0;
  v_a   numeric;
  v_b   numeric;
begin
  if p_candidate_traits = '{}'::jsonb and p_promoter_traits = '{}'::jsonb then
    return 0.5;
  end if;
  for v_key in
    select distinct key from (
      select jsonb_object_keys(p_candidate_traits) as key
      union
      select jsonb_object_keys(p_promoter_traits)
    ) k
  loop
    v_a := coalesce((p_candidate_traits ->> v_key)::numeric, 0);
    v_b := coalesce((p_promoter_traits ->> v_key)::numeric, 0);
    v_sum := v_sum + (1 - abs(v_a - v_b));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then return 0.5; end if;
  return v_sum / v_n;
end;
$$;

create or replace function public._match_build_justification(
  p_score numeric,
  p_breakdown jsonb,
  p_shared_interests text[]
)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[] := '{}';
begin
  if coalesce((p_breakdown -> 'course_affinity' ->> 'raw')::numeric, 0) >= 0.6 then
    v_parts := array_append(v_parts, 'curso compatível');
  end if;
  if p_shared_interests is not null and array_length(p_shared_interests, 1) > 0 then
    v_parts := array_append(
      v_parts,
      array_length(p_shared_interests, 1)::text || ' interesses em comum (' || array_to_string(p_shared_interests, ', ') || ')'
    );
  end if;
  if coalesce((p_breakdown -> 'focus_alignment' ->> 'raw')::numeric, 0) >= 0.8 then
    v_parts := array_append(v_parts, 'foco alinhado');
  end if;
  return round(p_score * 100)::text || '% - ' || coalesce(nullif(array_to_string(v_parts, ', '), ''), 'compatibilidade geral');
end;
$$;

-- -----------------------------------------------------------------------------
-- run_promoter_match
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
  v_candidate   public.candidates%rowtype;
  v_run         public.match_runs%rowtype;
  v_promoter    record;
  v_weights     record;
  v_breakdown   jsonb;
  v_raw         numeric;
  v_weighted_sum numeric;
  v_weight_sum  numeric;
  v_score       numeric;
  v_eligible    boolean;
  v_reason      text;
  v_results     jsonb := '[]'::jsonb;
  v_shared      text[];
  v_rank        integer := 0;
  v_day_start   timestamptz;
  v_day_end     timestamptz;
  v_workload    numeric;
  v_visits_day  integer;
  v_min_compat  numeric;
  v_item        jsonb;
begin
  select * into v_candidate from public.candidates where id = p_candidate_id;
  if not found then
    raise exception 'CANDIDATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_min_compat := coalesce(
    p_min_compatibility,
    (select min_compatibility from public.match_runs where tenant_id = v_candidate.tenant_id order by created_at desc limit 1),
    0.50
  );

  insert into public.match_runs (
    tenant_id, candidate_id, requested_window, course_id, trigger, requested_by, min_compatibility
  ) values (
    v_candidate.tenant_id,
    p_candidate_id,
    p_window,
    v_candidate.course_id,
    p_trigger::public.match_run_trigger,
    p_requested_by,
    v_min_compat
  )
  returning * into v_run;

  v_day_start := date_trunc('day', lower(p_window));
  v_day_end := v_day_start + interval '1 day';

  for v_promoter in
    select
      p.id as promoter_id,
      p.full_name,
      pp.traits,
      pp.preferred_focus,
      pp.experience_level,
      pp.max_visits_per_day,
      pp.rating_avg,
      pp.accepts_auto_match
    from public.profiles p
    join public.promoter_profiles pp on pp.profile_id = p.id
    where p.tenant_id = v_candidate.tenant_id
      and p.role = 'promotor'
      and p.is_active
      and pp.accepts_auto_match
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
          and v.status in ('agendada', 'aguardando_professor', 'confirmada', 'em_atendimento')
          and v.period && p_window
      )
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
      and v.status in ('agendada', 'aguardando_professor', 'confirmada', 'em_atendimento')
      and lower(v.period) >= v_day_start
      and lower(v.period) < v_day_end;

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
        continue; -- critério inativo (ex.: rating sem dados)
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
        jsonb_build_object(
          'raw', v_raw,
          'weight', v_weights.weight,
          'weighted', v_raw * v_weights.weight
        )
      );
      v_weighted_sum := v_weighted_sum + (v_raw * v_weights.weight);
      v_weight_sum := v_weight_sum + v_weights.weight;
    end loop;

    if v_weight_sum = 0 then
      v_score := 0;
    else
      v_score := v_weighted_sum / v_weight_sum;
    end if;

    if v_eligible and v_score < v_min_compat then
      v_eligible := false;
      v_reason := 'Compatibilidade abaixo do mínimo (' || round(v_min_compat * 100)::text || '%)';
    end if;

    select array_agg(ic.slug)
    into v_shared
    from public.candidate_interests ci
    join public.promoter_interests pi on pi.category_id = ci.category_id and pi.promoter_id = v_promoter.promoter_id
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

  -- Ordena elegíveis por score desc, depois workload/experiência
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

  -- Inelegíveis
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
      v_candidate.tenant_id,
      'no_substitute',
      'critical',
      'Nenhum promotor elegível para o candidato ' || v_candidate.full_name || ' na janela solicitada.'
    );
  else
    select * into v_run from public.match_runs where id = v_run.id;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
  values (
    v_candidate.tenant_id,
    p_requested_by,
    'match.run',
    'match_runs',
    v_run.id::text,
    jsonb_build_object('status', v_run.status, 'eligible_count', v_rank, 'trigger', p_trigger)
  );

  return v_run;
end;
$$;
