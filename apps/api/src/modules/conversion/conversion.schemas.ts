import { uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const candidateIdParamsSchema = z.object({ id: uuidSchema });

export const markEnrolledSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
