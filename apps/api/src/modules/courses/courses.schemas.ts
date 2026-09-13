import { uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const createCourseSchema = z.object({
  campusId: uuidSchema,
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const updateCourseSchema = createCourseSchema.partial();

export const courseIdParamsSchema = z.object({ id: uuidSchema });

export const listCoursesQuerySchema = z.object({
  campusId: uuidSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
