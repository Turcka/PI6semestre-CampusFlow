/**
 * Enums de domínio compartilhados entre API e Web.
 * Devem espelhar os tipos ENUM criados nas migrações do Supabase (Revisão 2).
 */

export const USER_ROLES = ['admin', 'promotor', 'professor'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Status informativo do candidato (legado lead_status). */
export const CANDIDATE_STATUSES = ['novo', 'contatado', 'agendado', 'visitou', 'matriculado', 'perdido'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** @deprecated Use CANDIDATE_STATUSES */
export const LEAD_STATUSES = CANDIDATE_STATUSES;
/** @deprecated Use CandidateStatus */
export type LeadStatus = CandidateStatus;

export const LEAD_HYGIENE_STATUSES = ['valid', 'duplicate', 'invalid'] as const;
export type LeadHygieneStatus = (typeof LEAD_HYGIENE_STATUSES)[number];

export const VISIT_TYPES = ['individual', 'group'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_STATUSES = [
  'agendada',
  'aguardando_promotor',
  'aguardando_professor',
  'confirmada',
  'em_atendimento',
  'realizada',
  'ausente',
  'cancelada',
  'reagendada',
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Status que ocupam o horário do promotor/professor (constraint EXCLUDE). */
export const ACTIVE_VISIT_STATUSES: readonly VisitStatus[] = [
  'agendada',
  'aguardando_professor',
  'confirmada',
  'em_atendimento',
];

export const VISIT_FOCUSES = ['tecnico', 'academico', 'profissional', 'institucional'] as const;
export type VisitFocus = (typeof VISIT_FOCUSES)[number];

export const PARTICIPANT_ROLES = ['promotor', 'professor'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'expired', 'cancelled'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const PROFESSOR_REQUIREMENTS = ['required', 'recommended', 'not_needed'] as const;
export type ProfessorRequirement = (typeof PROFESSOR_REQUIREMENTS)[number];

export const QUESTION_KINDS = ['single_choice', 'multi_choice', 'scale', 'free_text'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const CHATBOT_AUDIENCES = ['candidato', 'promotor'] as const;
export type ChatbotAudience = (typeof CHATBOT_AUDIENCES)[number];

export const MESSAGE_CHANNELS = ['whatsapp', 'email'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'opened',
  'clicked',
  'failed',
  'bounced',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const COMMUNICATION_TRIGGERS = [
  'visit.created',
  'visit.scheduled',
  'visit.confirmed',
  'visit.declined',
  'visit.cancelled',
  'visit.rescheduled',
  'reminder.day_before',
  'reminder.hour_before',
  'visit.completed',
  'promoter.invited',
  'promoter.reassigned',
  'professor.requested',
  'admin.no_substitute',
  'admin.visit_unattended',
] as const;
export type CommunicationTrigger = (typeof COMMUNICATION_TRIGGERS)[number];

export const NOTIFICATION_AUDIENCES = ['candidato', 'promotor', 'professor', 'admin'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const POI_CATEGORIES = [
  'laboratorio',
  'biblioteca',
  'auditorio',
  'sala_de_aula',
  'alimentacao',
  'secretaria',
  'estacionamento',
  'portaria',
  'outro',
] as const;
export type PoiCategory = (typeof POI_CATEGORIES)[number];

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const MATCH_CRITERIA = [
  'course_affinity',
  'interest_overlap',
  'behavioral_similarity',
  'focus_alignment',
  'service_experience',
  'workload_balance',
  'rating',
] as const;
export type MatchCriterion = (typeof MATCH_CRITERIA)[number];
