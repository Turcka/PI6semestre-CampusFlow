import { CANDIDATE_STATUSES, cpfSchema, paginationQuerySchema, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

import { normalizePhoneToE164 } from '../../utils/phone.js';

const phoneInputSchema = z.string().trim().min(8).max(30).transform((value, ctx) => {
  const phone = normalizePhoneToE164(value);
  if (!phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Telefone inválido.' });
    return z.NEVER;
  }
  return phone;
});

export const publicCandidateSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  cpf: cpfSchema,
  email: z.string().trim().toLowerCase().email(),
  phone: phoneInputSchema,
  courseId: uuidSchema,
  campusId: uuidSchema,
  source: z.string().trim().max(60).optional(),
  lgpdConsent: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar a política de privacidade.' }),
  }),
});

export const updateCandidateSchema = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  cpf: cpfSchema.optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: phoneInputSchema.optional().nullable(),
  courseId: uuidSchema.optional().nullable(),
  campusId: uuidSchema.optional().nullable(),
  source: z.string().trim().max(60).optional().nullable(),
  status: z.enum(CANDIDATE_STATUSES).optional(),
  preferredFocus: z.enum(['tecnico', 'academico', 'profissional', 'institucional']).optional().nullable(),
  availabilityWindows: z.array(z.record(z.unknown())).optional(),
  profileSummary: z.string().trim().max(1000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export const publicCandidatePatchSchema = updateCandidateSchema.pick({
  fullName: true,
  email: true,
  phone: true,
  courseId: true,
  campusId: true,
  availabilityWindows: true,
});

export const listCandidatesQuerySchema = paginationQuerySchema.extend({
  courseId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  status: z.enum(CANDIDATE_STATUSES).optional(),
  source: z.string().trim().max(60).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const candidateIdParamsSchema = z.object({ id: uuidSchema });
export const candidateTokenQuerySchema = z.object({ token: uuidSchema });
