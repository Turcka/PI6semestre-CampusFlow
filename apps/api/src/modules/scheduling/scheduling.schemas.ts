import {
  VISIT_STATUSES,
  createVisitSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@campusflow/shared';
import { z } from 'zod';

export { createVisitSchema };

export const generateSlotsSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  coordinatorId: uuidSchema.optional(),
});

export const listVisitsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(VISIT_STATUSES).optional(),
  coordinatorId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  leadId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const visitIdParamsSchema = z.object({ id: uuidSchema });

export const cancelVisitSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const rescheduleVisitSchema = z.object({
  slotId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
});

export const publicSlotsQuerySchema = z.object({
  campusId: uuidSchema,
  courseId: uuidSchema.optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
});
