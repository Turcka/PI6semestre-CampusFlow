import { PROFESSOR_REQUIREMENTS, VISIT_FOCUSES, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

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
