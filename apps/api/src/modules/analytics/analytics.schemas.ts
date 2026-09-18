import { uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const analyticsFilterSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  campusId: uuidSchema.optional(),
  courseId: uuidSchema.optional(),
  promoterId: uuidSchema.optional(),
  status: z.string().optional(),
});

export const timeseriesQuerySchema = analyticsFilterSchema.extend({
  metric: z.enum(['visits', 'confirmed', 'completed', 'absent', 'cancelled']).default('visits'),
});
