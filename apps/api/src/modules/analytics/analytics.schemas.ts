import { uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const analyticsRangeQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  campusId: uuidSchema.optional(),
});
