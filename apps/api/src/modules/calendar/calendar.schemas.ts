import { VISIT_STATUSES, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const listEventsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  view: z.enum(['day', 'week', 'month']).optional(),
  courseId: uuidSchema.optional(),
  promoterId: uuidSchema.optional(),
  professorId: uuidSchema.optional(),
  status: z.enum(VISIT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

export const agendaParamsSchema = z.object({ profileId: uuidSchema });

export const agendaQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const eventIdParamsSchema = z.object({ id: uuidSchema });

export const declineEventSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
