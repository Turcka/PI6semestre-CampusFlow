import { uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const listEventsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  coordinatorId: uuidSchema.optional(),
});

export const eventIdParamsSchema = z.object({ id: uuidSchema });

export const declineEventSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
