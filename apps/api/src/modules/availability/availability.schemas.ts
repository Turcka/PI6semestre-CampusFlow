import { uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const listRulesQuerySchema = z.object({ ownerId: uuidSchema.optional() });

const ruleInputSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm'),
    slotDurationMinutes: z.number().int().min(15).max(240).default(60),
    capacity: z.number().int().min(1).max(200).default(1),
    validFrom: z.string().date().optional().nullable(),
    validUntil: z.string().date().optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .refine((rule) => rule.startTime < rule.endTime, {
    message: 'Hora inicial deve ser anterior à final',
    path: ['endTime'],
  });

export const putRulesSchema = z.object({
  ownerId: uuidSchema.optional(),
  campusId: uuidSchema,
  rules: z.array(ruleInputSchema),
});

export const createExceptionSchema = z.object({
  ownerId: uuidSchema.optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  kind: z.enum(['block', 'extra', 'last_minute']).default('block'),
  reason: z.string().trim().max(300).optional(),
});

export const exceptionIdParamsSchema = z.object({ id: uuidSchema });

export const listExceptionsQuerySchema = z.object({
  ownerId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
