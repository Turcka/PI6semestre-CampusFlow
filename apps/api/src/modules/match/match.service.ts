import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import { buildJustification } from './justification.js';
import type { assignVisitSchema, previewMatchSchema, putWeightsSchema } from './match.schemas.js';
import {
  scorePromoter,
  type CandidateMatchProfile,
  type MatchWeight,
  type PromoterMatchProfile,
} from './scoring.js';

type PutWeights = z.infer<typeof putWeightsSchema>;
type Preview = z.infer<typeof previewMatchSchema>;
type Assign = z.infer<typeof assignVisitSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listWeights(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('match_weights')
    .select('*')
    .eq('tenant_id', user.tenantId)
    .order('criterion');
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function putWeights(req: Request, input: PutWeights) {
  const { user, supabase } = requireUser(req);
  const rows = input.weights.map((w) => ({
    tenant_id: user.tenantId,
    criterion: w.criterion,
    weight: w.weight,
    kind: w.kind,
    min_score: w.minScore ?? null,
    is_active: w.isActive,
  }));

  const { error: delError } = await supabase.from('match_weights').delete().eq('tenant_id', user.tenantId);
  if (delError) throw AppError.badRequest(delError.message);

  const { data, error } = await supabase.from('match_weights').insert(rows).select();
  if (error) throw AppError.badRequest(error.message);

  await supabase.from('audit_logs').insert({
    tenant_id: user.tenantId,
    actor_id: user.id,
    action: 'match.weights.update',
    entity: 'match_weights',
    diff: { count: rows.length },
  });

  return data ?? [];
}

export async function previewMatch(req: Request, input: Preview) {
  const { user, supabase } = requireUser(req);

  const { data: candidate, error: candError } = await supabase
    .from('candidates')
    .select('id, course_id, preferred_focus, behavioral_profile, candidate_interests(category_id, score, interest_categories(slug))')
    .eq('id', input.candidateId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (candError || !candidate) throw AppError.notFound('Candidato não encontrado.');

  const { data: weightsRows } = await supabase
    .from('match_weights')
    .select('*')
    .eq('tenant_id', user.tenantId)
    .eq('is_active', true);

  const weights: MatchWeight[] = (weightsRows ?? []).map((w) => ({
    criterion: w.criterion,
    weight: Number(w.weight),
    kind: w.kind,
    minScore: w.min_score,
  }));

  const { data: promoters } = await supabase
    .from('promoter_profiles')
    .select(
      'profile_id, preferred_focus, traits, max_visits_per_day, accepts_auto_match, rating_avg, profiles!inner(tenant_id), promoter_interests(category_id, level, interest_categories(slug)), promoter_courses(course_id, familiarity)',
    )
    .eq('profiles.tenant_id', user.tenantId);

  const candidateProfile: CandidateMatchProfile = {
    courseId: candidate.course_id,
    preferredFocus: candidate.preferred_focus,
    behavioralProfile: (candidate.behavioral_profile ?? {}) as Record<string, number>,
    interests: ((candidate.candidate_interests as Array<{
      category_id: string;
      score: number;
      interest_categories?: { slug?: string } | null;
    }>) ?? []).map((i) => ({
      categoryId: i.category_id,
      score: Number(i.score),
      slug: i.interest_categories?.slug,
    })),
  };

  const dayStart = new Date(input.windowStart);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const ranking = [];
  for (const p of promoters ?? []) {
    const courseLinks = (p.promoter_courses as Array<{ course_id: string; familiarity: number }>) ?? [];
    const promoterProfile: PromoterMatchProfile = {
      id: p.profile_id,
      courseIds: courseLinks.map((c) => c.course_id),
      courseFamiliarity: Object.fromEntries(courseLinks.map((c) => [c.course_id, Number(c.familiarity)])),
      preferredFocus: Array.isArray(p.preferred_focus) ? (p.preferred_focus[0] ?? null) : p.preferred_focus,
      behavioralTraits: (p.traits ?? {}) as Record<string, number>,
      interests: ((p.promoter_interests as Array<{
        category_id: string;
        level: number;
        interest_categories?: { slug?: string } | null;
      }>) ?? []).map((i) => ({
        categoryId: i.category_id,
        level: Number(i.level),
        slug: i.interest_categories?.slug,
      })),
      visitsToday: 0,
      maxVisitsPerDay: p.max_visits_per_day ?? 4,
      rating: p.rating_avg != null ? Number(p.rating_avg) : null,
      acceptsAutoMatch: p.accepts_auto_match !== false,
      hasAvailability: true,
    };

    const { count } = await supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('promoter_id', p.profile_id)
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', dayEnd.toISOString())
      .in('status', ['agendada', 'aguardando_promotor', 'aguardando_professor', 'confirmada', 'em_atendimento']);

    promoterProfile.visitsToday = count ?? 0;

    const scored = scorePromoter(candidateProfile, promoterProfile, weights);
    ranking.push({
      promoterId: p.profile_id,
      score: scored.score,
      eligible: scored.eligible,
      reasons: scored.reasons,
      breakdown: scored.breakdown,
      justification: buildJustification(scored.score, scored),
    });
  }

  ranking.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.score - a.score;
  });

  return {
    candidateId: input.candidateId,
    window: { start: input.windowStart, end: input.windowEnd },
    ranking,
  };
}

export async function getMatchRun(req: Request, runId: string) {
  const { user, supabase } = requireUser(req);
  const { data: run, error } = await supabase
    .from('match_runs')
    .select('*, match_results(*)')
    .eq('id', runId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !run) throw AppError.notFound('Execução de match não encontrada.');
  return run;
}

export async function assignVisitManually(req: Request, visitId: string, input: Assign) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.rpc('assign_visit_manually', {
    p_visit_id: visitId,
    p_role: 'promotor',
    p_profile_id: input.promoterId,
    p_actor: user.id,
  });
  if (error) mapRpcError(error);

  if (input.professorId) {
    const { data: profData, error: profError } = await supabase.rpc('assign_visit_manually', {
      p_visit_id: visitId,
      p_role: 'professor',
      p_profile_id: input.professorId,
      p_actor: user.id,
    });
    if (profError) mapRpcError(profError);
    return profData;
  }

  return data;
}
