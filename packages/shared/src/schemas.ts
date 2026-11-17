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

/**
 * Em desenvolvimento / testes aceita qualquer CPF com 11 dígitos.
 * Em produção exige dígitos verificadores, salvo RELAX_CPF_VALIDATION=true
 * (ou VITE_RELAX_CPF_VALIDATION=true no frontend).
 */
export function isCpfValidationRelaxed(): boolean {
  const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;
  if (nodeEnv?.RELAX_CPF_VALIDATION === 'true') return true;
  if (nodeEnv?.RELAX_CPF_VALIDATION === 'false') return false;

  try {
    const metaEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    if (metaEnv?.VITE_RELAX_CPF_VALIDATION === 'true') return true;
    if (metaEnv?.VITE_RELAX_CPF_VALIDATION === 'false') return false;
    if (metaEnv?.DEV === true || metaEnv?.MODE === 'development') return true;
    if (metaEnv?.PROD === true || metaEnv?.MODE === 'production') return false;
  } catch {
    /* Node sem import.meta.env */
  }

  // Strict só quando NODE_ENV=production; undefined/test/development = relaxado.
  return nodeEnv?.NODE_ENV !== 'production';
}

/** Algoritmo oficial dos dígitos verificadores do CPF. */
export function isValidCpfChecksum(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const d1 = calc(digits.slice(0, 9), 10);
  const d2 = calc(digits.slice(0, 10), 11);
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

/** CPF com 11 dígitos; checksum obrigatório só em produção (salvo flag de teste). */
export const cpfSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => /^\d{11}$/.test(v), 'CPF deve ter 11 dígitos')
  .refine((v) => isCpfValidationRelaxed() || isValidCpfChecksum(v), 'CPF inválido');

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
/** Instante ISO-8601 com `Z` ou deslocamento (`+00:00`), como o Postgres devolve. */
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const scheduleVisitSchema = z.object({
  candidateId: uuidSchema,
  windowStart: isoDateTimeSchema,
  windowEnd: isoDateTimeSchema,
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

/** Idade completa em anos numa data de referência (padrão: hoje). */
export function ageInYears(birthDate: string | Date, reference: Date = new Date()): number {
  const birth = typeof birthDate === 'string' ? new Date(`${birthDate}T00:00:00`) : birthDate;
  let age = reference.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    reference.getMonth() < birth.getMonth() ||
    (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const ADULT_AGE = 18;

export function isAdult(birthDate: string | Date, reference: Date = new Date()): boolean {
  return ageInYears(birthDate, reference) >= ADULT_AGE;
}

/** Data de nascimento `YYYY-MM-DD`, válida, no passado e com idade plausível (≤ 120 anos). */
export const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00`).getTime()), 'Data inválida')
  .refine((v) => new Date(`${v}T00:00:00`).getTime() < Date.now(), 'Data de nascimento deve estar no passado')
  .refine((v) => ageInYears(v) <= 120, 'Data de nascimento inválida');

/** Data de nascimento de promotor: obrigatoriamente maior de idade. */
export const adultBirthDateSchema = birthDateSchema.refine((v) => isAdult(v), {
  message: 'Promotores precisam ter 18 anos ou mais',
});

const inviteUserBaseSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(3).max(120),
  role: z.enum(USER_ROLES),
  courseIds: z.array(uuidSchema).optional(),
  phone: z.string().trim().max(30).optional(),
  birthDate: birthDateSchema.optional(),
});

/** Promotor exige data de nascimento (e 18+); demais papéis é opcional. */
function requireAdultPromoter(data: { role: string; birthDate?: string }, ctx: z.RefinementCtx) {
  if (data.role !== 'promotor') return;
  if (!data.birthDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'Data de nascimento é obrigatória para promotores' });
    return;
  }
  if (!isAdult(data.birthDate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'Promotores precisam ter 18 anos ou mais' });
  }
}

export const inviteUserSchema = inviteUserBaseSchema.superRefine(requireAdultPromoter);
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/** Criação direta com senha (útil em ambiente local / admin seed). */
export const createUserSchema = inviteUserBaseSchema
  .extend({
    password: z.string().min(8).max(72),
  })
  .superRefine(requireAdultPromoter);
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Auto-edição do próprio perfil (PATCH /auth/me). */
export const updateMeSchema = z
  .object({
    fullName: z.string().trim().min(3).max(120).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    birthDate: birthDateSchema.nullable().optional(),
    avatarUrl: z.string().url().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar.' });
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

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

// -----------------------------------------------------------------------------
// Secretário virtual (LLM)
// -----------------------------------------------------------------------------

/** Versão do texto de consentimento exibido no cadastro público (gravada em candidates.metadata). */
export const CONSENT_VERSION = '2026-11-assistente-ia';

export const CHATBOT_SESSION_MODES = ['guided', 'llm'] as const;
export type ChatbotSessionMode = (typeof CHATBOT_SESSION_MODES)[number];

/** Mensagem do visitante para o secretário virtual. */
export const assistantMessageSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});
export type AssistantMessageInput = z.infer<typeof assistantMessageSchema>;

export const assistantModeSchema = z.object({
  mode: z.enum(CHATBOT_SESSION_MODES),
});

/** Critérios de decisão de matrícula (values da pergunta `prioridades_matricula`). */
export const MATRICULATION_PRIORITIES = [
  'custo_bolsas',
  'empregabilidade',
  'infraestrutura',
  'reputacao',
  'localizacao',
  'vida_campus',
  'intercambio',
] as const;
export type MatriculationPriority = (typeof MATRICULATION_PRIORITIES)[number];

export const MATRICULATION_PRIORITY_LABELS: Record<MatriculationPriority, string> = {
  custo_bolsas: 'Mensalidade, bolsas e financiamento',
  empregabilidade: 'Empregabilidade e estágios',
  infraestrutura: 'Laboratórios e infraestrutura',
  reputacao: 'Reputação e qualidade do ensino',
  localizacao: 'Localização e deslocamento',
  vida_campus: 'Vida no campus',
  intercambio: 'Intercâmbio e dupla titulação',
};

export const DECISION_STAGES = ['explorando', 'comparando', 'decidido'] as const;
export const DECISION_INFLUENCERS = ['sozinho', 'pais', 'amigos', 'escola'] as const;
export const SCHOOL_MOMENTS = ['em2', 'em3', 'concluido', 'transferencia', 'outro'] as const;
export const DECISION_TIMELINES = ['este_semestre', 'proximo_semestre', 'proximo_ano', 'indefinido'] as const;

/** Insights gerados pela síntese da conversa (candidates.ai_insights). */
export const aiInsightsSchema = z.object({
  /** Resumo em linguagem natural (cópia do que vai para candidates.profile_summary). */
  summary: z.string().max(1200).optional(),
  priorities: z
    .array(
      z.object({
        key: z.enum(MATRICULATION_PRIORITIES),
        rank: z.number().int().min(1).max(7),
        evidence: z.string().max(200).optional(),
      }),
    )
    .max(7),
  goals: z.array(z.string().max(200)).max(5),
  doubts: z.array(z.string().max(200)).max(8),
  objections: z.array(z.string().max(200)).max(5),
  decisionStage: z.enum(DECISION_STAGES).nullable(),
  influencers: z.array(z.enum(DECISION_INFLUENCERS)),
  schoolMoment: z.enum(SCHOOL_MOMENTS).nullable(),
  decisionTimeline: z.enum(DECISION_TIMELINES).nullable(),
  suggestedFocus: z.enum(VISIT_FOCUSES).nullable(),
  talkingPoints: z.array(z.string().max(200)).max(3),
  model: z.string().optional(),
  generatedAt: z.string().datetime().optional(),
});
export type AiInsights = z.infer<typeof aiInsightsSchema>;

/** Configuração do assistente por tenant (tenants.settings.assistant). */
export const assistantSettingsSchema = z.object({
  enabled: z.boolean(),
  persona_name: z.string().trim().min(2).max(40),
  tone: z.string().trim().min(3).max(120),
  facts: z
    .array(z.object({ topic: z.string().trim().min(2).max(60), text: z.string().trim().min(3).max(500) }))
    .max(40),
  max_turns: z.number().int().min(4).max(40),
});
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: false,
  persona_name: 'Sofia',
  tone: 'acolhedor e direto',
  facts: [],
  max_turns: 16,
};

export const setVisitStatusSchema = z.object({
  status: z.enum(VISIT_STATUSES),
  reason: z.string().trim().max(500).optional(),
});
export type SetVisitStatusInput = z.infer<typeof setVisitStatusSchema>;

export const visitFocusSchema = z.enum(VISIT_FOCUSES);
