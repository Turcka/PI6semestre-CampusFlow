import { z } from 'zod';

import {
  CHATBOT_AUDIENCES,
  MESSAGE_CHANNELS,
  QUESTION_KINDS,
  USER_ROLES,
  VISIT_FOCUSES,
  VISIT_STATUSES,
  VISIT_TYPES,
} from './enums.js';

/** Telefone brasileiro em E.164 (+55DDDNÚMERO). */
export const phoneE164Schema = z
  .string()
  .regex(/^\+55\d{10,11}$/, 'Telefone deve estar no formato +55DDDNÚMERO');

/** CPF com 11 dígitos e dígitos verificadores. */
export const cpfSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => /^\d{11}$/.test(v), 'CPF deve ter 11 dígitos')
  .refine((v) => {
    if (/^(\d)\1{10}$/.test(v)) return false;
    const calc = (base: string, factor: number) => {
      let sum = 0;
      for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    const d1 = calc(v.slice(0, 9), 10);
    const d2 = calc(v.slice(0, 10), 11);
    return d1 === Number(v[9]) && d2 === Number(v[10]);
  }, 'CPF inválido');

export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Cadastro público do candidato (passo 1 do chatbot). */
export const publicCandidateSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  cpf: cpfSchema,
  email: z.string().trim().toLowerCase().email(),
  phone: phoneE164Schema,
  courseId: uuidSchema,
  campusId: uuidSchema,
  source: z.string().trim().max(60).optional(),
  lgpdConsent: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar a política de privacidade.' }),
  }),
});
export type PublicCandidateInput = z.infer<typeof publicCandidateSchema>;

/** @deprecated Use publicCandidateSchema */
export const publicLeadSchema = publicCandidateSchema;
/** @deprecated Use PublicCandidateInput */
export type PublicLeadInput = PublicCandidateInput;

/** Agendamento público via match (janela tstzrange ISO). */
export const scheduleVisitSchema = z.object({
  candidateId: uuidSchema,
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  portalToken: uuidSchema.optional(),
});
export type ScheduleVisitInput = z.infer<typeof scheduleVisitSchema>;

/** @deprecated Prefer scheduleVisitSchema */
export const createVisitSchema = z.object({
  slotId: uuidSchema,
  leadId: uuidSchema.optional(),
  candidateId: uuidSchema.optional(),
  type: z.enum(VISIT_TYPES).default('individual'),
  groupSize: z.number().int().min(1).max(200).default(1),
  notes: z.string().trim().max(500).optional(),
});
export type CreateVisitInput = z.infer<typeof createVisitSchema>;

/** Regra semanal de disponibilidade (promotor ou professor). */
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

export const chatbotAnswerSchema = z.object({
  questionId: uuidSchema,
  value: z.union([
    z.object({ value: z.union([z.string(), z.number()]) }),
    z.object({ values: z.array(z.string()) }),
    z.record(z.unknown()),
  ]),
});
export type ChatbotAnswerInput = z.infer<typeof chatbotAnswerSchema>;

export const chatbotQuestionSchema = z.object({
  key: z.string().trim().min(2).max(60),
  prompt: z.string().trim().min(3).max(500),
  kind: z.enum(QUESTION_KINDS),
  audience: z.enum(CHATBOT_AUDIENCES).default('candidato'),
  courseId: uuidSchema.nullable().optional(),
  options: z.array(z.record(z.unknown())).default([]),
  orderIndex: z.number().int().min(0).default(0),
  isRequired: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type ChatbotQuestionInput = z.infer<typeof chatbotQuestionSchema>;

export const setVisitStatusSchema = z.object({
  status: z.enum(VISIT_STATUSES),
  reason: z.string().trim().max(500).optional(),
});
export type SetVisitStatusInput = z.infer<typeof setVisitStatusSchema>;

export const visitFocusSchema = z.enum(VISIT_FOCUSES);
