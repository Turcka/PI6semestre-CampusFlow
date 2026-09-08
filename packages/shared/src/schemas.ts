import { z } from 'zod';

import { MESSAGE_CHANNELS, USER_ROLES, VISIT_TYPES } from './enums.js';

/** Telefone brasileiro em E.164 (+55DDDNÚMERO). */
export const phoneE164Schema = z
  .string()
  .regex(/^\+55\d{10,11}$/, 'Telefone deve estar no formato +55DDDNÚMERO');

export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Formulário público do candidato (RF-02). */
export const publicLeadSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: phoneE164Schema,
  courseId: uuidSchema,
  campusId: uuidSchema,
  source: z.string().trim().max(60).optional(),
  lgpdConsent: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar a política de privacidade.' }),
  }),
});
export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

/** Reserva de horário pelo candidato (RF-03). */
export const createVisitSchema = z.object({
  slotId: uuidSchema,
  leadId: uuidSchema,
  type: z.enum(VISIT_TYPES).default('individual'),
  groupSize: z.number().int().min(1).max(200).default(1),
  notes: z.string().trim().max(500).optional(),
});
export type CreateVisitInput = z.infer<typeof createVisitSchema>;

/** Regra semanal de disponibilidade do coordenador. */
export const availabilityRuleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm'),
    slotDurationMinutes: z.number().int().min(15).max(240).default(60),
    capacity: z.number().int().min(1).max(200).default(1),
  })
  .refine((rule) => rule.startTime < rule.endTime, {
    message: 'Hora inicial deve ser anterior à final',
    path: ['endTime'],
  });
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;

/** Template de mensagem (RF-05). */
export const messageTemplateSchema = z.object({
  name: z.string().trim().min(3).max(80),
  channel: z.enum(MESSAGE_CHANNELS),
  subject: z.string().trim().max(150).optional(),
  body: z.string().trim().min(1),
  providerTemplateName: z.string().trim().max(120).optional(),
});
export type MessageTemplateInput = z.infer<typeof messageTemplateSchema>;

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(3).max(120),
  role: z.enum(USER_ROLES),
  courseIds: z.array(uuidSchema).optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
