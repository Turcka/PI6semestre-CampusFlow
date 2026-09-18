-- =============================================================================
-- 0018_fix_match_slot_check.sql
-- Alinha elegibilidade do match ao slot exato (starts_at/ends_at = janela).
-- =============================================================================

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
  v_day_start    timestamptz;
  v_day_end      timestamptz;
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

  v_day_start := date_trunc('day', lower(p_window));
  v_day_end := v_day_start + interval '1 day';

  for v_promoter in
    select
      p.id as promoter_id, p.full_name, pp.traits, pp.preferred_focus,
      pp.experience_level, pp.max_visits_per_day, pp.rating_avg
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
