import { PROFESSOR_REQUIREMENTS, VISIT_FOCUSES, VISIT_STATUSES, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const updatePromoterProfileSchema = z.object({
  bio: z.string().trim().max(2000).optional().nullable(),
  traits: z.record(z.number()).optional(),
  preferredFocus: z.array(z.enum(VISIT_FOCUSES)).optional(),
  experienceLevel: z.number().int().min(1).max(5).optional(),
  maxVisitsPerDay: z.number().int().min(1).max(20).optional(),
  acceptsAutoMatch: z.boolean().optional(),
  courseFamiliarity: z
    .array(z.object({ courseId: uuidSchema, familiarity: z.number().int().min(1).max(5) }))
    .optional(),
  interests: z
    .array(z.object({ categoryId: uuidSchema, level: z.number().int().min(1).max(5) }))
    .optional(),
  poiIds: z.array(uuidSchema).optional(),
});

export const listPromotersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

export const promoterIdParamsSchema = z.object({ id: uuidSchema });

export const listMyVisitsQuerySchema = z.object({
  status: z.enum(VISIT_STATUSES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const updateProfessorProfileSchema = z.object({
  area: z.string().trim().max(200).optional().nullable(),
  topics: z.array(z.string().trim().max(80)).optional(),
  acceptsVisits: z.boolean().optional(),
  isSubstitute: z.boolean().optional(),
  courseIds: z.array(uuidSchema).optional(),
});

export const professorRequirementRuleSchema = z.object({
  courseId: uuidSchema.nullable().optional(),
  focus: z.enum(VISIT_FOCUSES).nullable().optional(),
  interestCategoryId: uuidSchema.nullable().optional(),
  requirement: z.enum(PROFESSOR_REQUIREMENTS),
  priority: z.number().int().min(0).max(1000).default(100),
  isActive: z.boolean().default(true),
});

export const requirementRuleIdParamsSchema = z.object({ id: uuidSchema });
