import { chatbotAnswerSchema, chatbotQuestionSchema, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const sessionIdParamsSchema = z.object({ id: uuidSchema });
export const questionIdParamsSchema = z.object({ id: uuidSchema });
export const categoryIdParamsSchema = z.object({ id: uuidSchema });

export const answerSchema = chatbotAnswerSchema;
export const createQuestionSchema = chatbotQuestionSchema;
export const updateQuestionSchema = chatbotQuestionSchema.partial();

export const reorderQuestionsSchema = z.object({ questionIds: z.array(uuidSchema).min(1) });

export const listQuestionsQuerySchema = z.object({
  audience: z.enum(['candidato', 'promotor']).optional(),
  courseId: uuidSchema.optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const interestCategorySchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen.'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateInterestCategorySchema = interestCategorySchema.partial();
