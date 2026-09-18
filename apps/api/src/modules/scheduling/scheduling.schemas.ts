import {
  VISIT_STATUSES,
  paginationQuerySchema,
  scheduleVisitSchema,
  uuidSchema,
} from '@campusflow/shared';
import { z } from 'zod';

export const generateSlotsSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  ownerId: uuidSchema.optional(),
});

export const listVisitsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(VISIT_STATUSES).optional(),
  promoterId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  candidateId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const visitIdParamsSchema = z.object({ id: uuidSchema });

export const cancelVisitSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  portalToken: uuidSchema.optional(),
});

export const rescheduleVisitSchema = z.object({
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  reason: z.string().trim().max(500).optional(),
  portalToken: uuidSchema.optional(),
});

export const publicWindowsQuerySchema = z.object({
  candidateId: uuidSchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
  portalToken: uuidSchema.optional(),
});

export const publicScheduleVisitSchema = scheduleVisitSchema;

export const schedulingPolicySchema = z.object({
  focus: z.enum(['tecnico', 'academico', 'profissional', 'institucional']).nullable().optional(),
  minHoursToCancel: z.number().int().min(0).max(168).default(24),
  minHoursToReschedule: z.number().int().min(0).max(168).default(12),
  invitationTimeoutMinutes: z.number().int().min(15).max(1440).default(120),
  maxReassignments: z.number().int().min(0).max(20).default(3),
  defaultDurationMinutes: z.number().int().min(15).max(240).default(60),
});
