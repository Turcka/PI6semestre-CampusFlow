import type { MatchCriterion, VisitFocus } from '@campusflow/shared';

export type MatchWeight = {
  criterion: MatchCriterion;
  weight: number;
  kind: 'mandatory' | 'complementary' | 'tiebreaker';
  minScore?: number | null;
};

export type CandidateMatchProfile = {
  courseId: string | null;
  preferredFocus: VisitFocus | null;
  behavioralProfile: Record<string, number>;
  interests: Array<{ categoryId: string; slug?: string; score: number }>;
};

export type PromoterMatchProfile = {
  id: string;
  courseIds: string[];
  courseFamiliarity: Record<string, number>;
  preferredFocus: VisitFocus | null;
  behavioralTraits: Record<string, number>;
  interests: Array<{ categoryId: string; slug?: string; level: number }>;
  visitsToday: number;
  maxVisitsPerDay: number;
  rating: number | null;
  acceptsAutoMatch: boolean;
  hasAvailability: boolean;
};

export type ScoreBreakdownItem = {
  raw: number;
  weight: number;
  weighted: number;
  kind: MatchWeight['kind'];
};

export type ScoreResult = {
  score: number;
  breakdown: Record<string, ScoreBreakdownItem>;
  eligible: boolean;
  reasons: string[];
  sharedInterests: string[];
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function courseAffinity(candidate: CandidateMatchProfile, promoter: PromoterMatchProfile): number {
  if (!candidate.courseId) return 0.5;
  if (!promoter.courseIds.includes(candidate.courseId)) return 0;
  const familiarity = promoter.courseFamiliarity[candidate.courseId] ?? 3;
  return clamp01(familiarity / 5);
}

export function interestOverlap(candidate: CandidateMatchProfile, promoter: PromoterMatchProfile): {
  score: number;
  shared: string[];
} {
  if (!candidate.interests.length && !promoter.interests.length) return { score: 0.5, shared: [] };
  if (!candidate.interests.length || !promoter.interests.length) return { score: 0, shared: [] };

  const promoterByCategory = new Map(promoter.interests.map((item) => [item.categoryId, item]));
  let sum = 0;
  const shared: string[] = [];
  for (const interest of candidate.interests) {
    const match = promoterByCategory.get(interest.categoryId);
    if (!match) continue;
    sum += Math.min(interest.score, match.level / 5);
    shared.push(interest.slug ?? interest.categoryId);
  }
  return { score: clamp01(sum / candidate.interests.length), shared };
}

export function behavioralSimilarity(candidate: CandidateMatchProfile, promoter: PromoterMatchProfile): number {
  const keys = new Set([
    ...Object.keys(candidate.behavioralProfile ?? {}),
    ...Object.keys(promoter.behavioralTraits ?? {}),
  ]);
  if (!keys.size) return 0.5;
  let sum = 0;
  for (const key of keys) {
    const a = candidate.behavioralProfile[key] ?? 0;
    const b = promoter.behavioralTraits[key] ?? 0;
    sum += 1 - Math.abs(a - b);
  }
  return clamp01(sum / keys.size);
}

export function focusAlignment(candidate: CandidateMatchProfile, promoter: PromoterMatchProfile): number {
  if (!candidate.preferredFocus || !promoter.preferredFocus) return 0.5;
  return candidate.preferredFocus === promoter.preferredFocus ? 1 : 0.2;
}

export function serviceExperience(promoter: PromoterMatchProfile): number {
  // proxy simples: rating normalizado; sem rating = neutro
  if (promoter.rating == null) return 0.5;
  return clamp01(promoter.rating / 5);
}

export function workloadBalance(promoter: PromoterMatchProfile): number {
  if (promoter.maxVisitsPerDay <= 0) return 0;
  return clamp01(1 - promoter.visitsToday / promoter.maxVisitsPerDay);
}

export function ratingScore(promoter: PromoterMatchProfile): number {
  return serviceExperience(promoter);
}

const scorers: Record<MatchCriterion, (c: CandidateMatchProfile, p: PromoterMatchProfile) => number> = {
  course_affinity: courseAffinity,
  interest_overlap: (c, p) => interestOverlap(c, p).score,
  behavioral_similarity: behavioralSimilarity,
  focus_alignment: focusAlignment,
  service_experience: (_c, p) => serviceExperience(p),
  workload_balance: (_c, p) => workloadBalance(p),
  rating: (_c, p) => ratingScore(p),
};

export function scorePromoter(
  candidate: CandidateMatchProfile,
  promoter: PromoterMatchProfile,
  weights: MatchWeight[],
): ScoreResult {
  const reasons: string[] = [];
  if (!promoter.acceptsAutoMatch) {
    return { score: 0, breakdown: {}, eligible: false, reasons: ['Promotor não aceita match automático'], sharedInterests: [] };
  }
  if (!promoter.hasAvailability) {
    return { score: 0, breakdown: {}, eligible: false, reasons: ['Sem disponibilidade na janela'], sharedInterests: [] };
  }

  const active = weights.filter((w) => w.weight > 0 || w.kind === 'mandatory');
  const breakdown: Record<string, ScoreBreakdownItem> = {};
  let weightedSum = 0;
  let weightSum = 0;
  let eligible = true;
  const { shared } = interestOverlap(candidate, promoter);

  for (const weight of active) {
    if (weight.kind === 'tiebreaker') continue;
    const raw = scorers[weight.criterion](candidate, promoter);
    const weighted = raw * weight.weight;
    breakdown[weight.criterion] = { raw, weight: weight.weight, weighted, kind: weight.kind };
    weightedSum += weighted;
    weightSum += weight.weight;
    if (weight.kind === 'mandatory' && weight.minScore != null && raw < weight.minScore) {
      eligible = false;
      reasons.push(`${weight.criterion} abaixo do mínimo (${raw.toFixed(2)} < ${weight.minScore})`);
    }
  }

  const score = weightSum > 0 ? clamp01(weightedSum / weightSum) : 0;
  return { score, breakdown, eligible, reasons, sharedInterests: shared };
}

/** Resolve empate aplicando critérios tiebreaker na ordem dos pesos. */
export function applyTiebreakers(
  a: { promoterId: string; score: number; raw: ScoreResult; promoter: PromoterMatchProfile },
  b: { promoterId: string; score: number; raw: ScoreResult; promoter: PromoterMatchProfile },
  weights: MatchWeight[],
): number {
  if (Math.abs(a.score - b.score) > 1e-6) return b.score - a.score;
  for (const weight of weights.filter((w) => w.kind === 'tiebreaker')) {
    const av = scorers[weight.criterion]({} as CandidateMatchProfile, a.promoter);
    const bv = scorers[weight.criterion]({} as CandidateMatchProfile, b.promoter);
    if (Math.abs(av - bv) > 1e-6) return bv - av;
  }
  return a.promoterId.localeCompare(b.promoterId);
}
