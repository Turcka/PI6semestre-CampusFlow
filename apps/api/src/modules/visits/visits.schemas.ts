import { VISIT_FOCUSES, VISIT_STATUSES, VISIT_TYPES, paginationQuerySchema, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const listVisitsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(VISIT_STATUSES).optional(),
  courseId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  promoterId: uuidSchema.optional(),
  professorId: uuidSchema.optional(),
  candidateId: uuidSchema.optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const visitIdParamsSchema = z.object({ id: uuidSchema });

export const setVisitStatusSchema = z.object({
  status: z.enum(['em_atendimento', 'realizada', 'ausente', 'confirmada', 'cancelada']),
  reason: z.string().trim().max(500).optional(),
});

export const createVisitNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  phase: z.enum(['before', 'during', 'after']).default('during'),
});

export const createManualVisitSchema = z.object({
  candidateId: uuidSchema,
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  promoterId: uuidSchema.optional(),
  professorId: uuidSchema.nullable().optional(),
  type: z.enum(VISIT_TYPES).default('individual'),
  focus: z.enum(VISIT_FOCUSES).optional(),
});

export const assignVisitSchema = z.object({
  promoterId: uuidSchema,
  professorId: uuidSchema.nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const cancelVisitSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  override: z.boolean().optional(),
});

export const rescheduleVisitSchema = z.object({
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  reason: z.string().trim().max(500).optional(),
  override: z.boolean().optional(),
});
