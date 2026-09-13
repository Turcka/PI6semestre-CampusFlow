import {
  LEAD_STATUSES,
  paginationQuerySchema,
  uuidSchema,
} from '@campusflow/shared';
import { z } from 'zod';

import { normalizePhoneToE164 } from '../../utils/phone.js';

/** Formulário público: aceita telefone BR e normaliza para E.164. */
export const publicLeadSchema = z
  .object({
    fullName: z.string().trim().min(3).max(120),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().min(8).max(30),
    courseId: uuidSchema,
    campusId: uuidSchema,
    source: z.string().trim().max(60).optional(),
    lgpdConsent: z.literal(true, {
      errorMap: () => ({ message: 'É necessário aceitar a política de privacidade.' }),
    }),
  })
  .transform((data, ctx) => {
    const phone = normalizePhoneToE164(data.phone);
    if (!phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Telefone inválido.', path: ['phone'] });
      return z.NEVER;
    }
    return { ...data, phone };
  });

export const createLeadSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  courseId: uuidSchema.optional().nullable(),
  campusId: uuidSchema.optional().nullable(),
  source: z.string().trim().max(60).optional().nullable(),
  status: z.enum(LEAD_STATUSES).optional(),
  consentAt: z.string().datetime().optional().nullable(),
  consentSource: z.string().trim().max(60).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateLeadSchema = createLeadSchema.partial();

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  courseId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().trim().max(60).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const leadIdParamsSchema = z.object({ id: uuidSchema });
export const importIdParamsSchema = z.object({ importId: uuidSchema });
