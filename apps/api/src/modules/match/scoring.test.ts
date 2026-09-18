import { describe, expect, it } from 'vitest';

import { buildJustification } from './justification.js';
import { scorePromoter, type CandidateMatchProfile, type MatchWeight, type PromoterMatchProfile } from './scoring.js';

const weights: MatchWeight[] = [
  { criterion: 'course_affinity', weight: 30, kind: 'mandatory', minScore: 0.5 },
  { criterion: 'interest_overlap', weight: 25, kind: 'complementary' },
  { criterion: 'behavioral_similarity', weight: 15, kind: 'complementary' },
  { criterion: 'focus_alignment', weight: 15, kind: 'complementary' },
  { criterion: 'workload_balance', weight: 10, kind: 'tiebreaker' },
  { criterion: 'rating', weight: 5, kind: 'complementary' },
];

const candidate: CandidateMatchProfile = {
  courseId: 'course-auto',
  preferredFocus: 'tecnico',
  behavioralProfile: { curiosity: 0.8 },
  interests: [
    { categoryId: 'c1', slug: 'carros', score: 1 },
    { categoryId: 'c2', slug: 'tecnologia', score: 0.8 },
  ],
};

const automotivePromoter: PromoterMatchProfile = {
  id: 'p1',
  courseIds: ['course-auto'],
  courseFamiliarity: { 'course-auto': 5 },
  preferredFocus: 'tecnico',
  behavioralTraits: { curiosity: 0.7 },
  interests: [
    { categoryId: 'c1', slug: 'carros', level: 5 },
    { categoryId: 'c2', slug: 'tecnologia', level: 4 },
  ],
  visitsToday: 1,
  maxVisitsPerDay: 4,
  rating: 4.5,
  acceptsAutoMatch: true,
  hasAvailability: true,
};

const otherPromoter: PromoterMatchProfile = {
  ...automotivePromoter,
  id: 'p2',
  courseIds: ['course-adm'],
  courseFamiliarity: { 'course-adm': 5 },
  preferredFocus: 'institucional',
  interests: [{ categoryId: 'c3', slug: 'gestao', level: 5 }],
};

describe('match scoring', () => {
  it('ranqueia promotor de curso compatível acima de outro', () => {
    const a = scorePromoter(candidate, automotivePromoter, weights);
    const b = scorePromoter(candidate, otherPromoter, weights);
    expect(a.eligible).toBe(true);
    expect(b.eligible).toBe(false);
    expect(a.score).toBeGreaterThan(b.score);
    expect(buildJustification(a.score, a)).toContain('%');
  });

  it('marca inelegível sem disponibilidade', () => {
    const result = scorePromoter(candidate, { ...automotivePromoter, hasAvailability: false }, weights);
    expect(result.eligible).toBe(false);
  });
});
