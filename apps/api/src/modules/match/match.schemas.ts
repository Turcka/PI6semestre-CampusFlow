import { MATCH_CRITERIA } from '@campusflow/shared';
import { z } from 'zod';

export const listWeightsSchema = z.object({});

export const putWeightsSchema = z.object({
  weights: z.array(
    z.object({
      criterion: z.enum(MATCH_CRITERIA),
      weight: z.number().min(0).max(100),
      kind: z.enum(['mandatory', 'complementary', 'tiebreaker']).default('complementary'),
      minScore: z.number().min(0).max(1).nullable().optional(),
      isActive: z.boolean().default(true),
    }),
  ),
});

export const previewMatchSchema = z.object({
  candidateId: z.string().uuid(),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
});

export const runIdParamsSchema = z.object({ id: z.string().uuid() });

export const assignVisitSchema = z.object({
  promoterId: z.string().uuid(),
  professorId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});
