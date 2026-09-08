/**
 * Enums de domínio compartilhados entre API e Web.
 * Devem espelhar os tipos ENUM criados nas migrações do Supabase.
 */

export const USER_ROLES = ['admin', 'secretaria', 'coordenador', 'marketing', 'embaixador'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const LEAD_STATUSES = ['novo', 'contatado', 'agendado', 'visitou', 'matriculado', 'perdido'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_HYGIENE_STATUSES = ['valid', 'duplicate', 'invalid'] as const;
export type LeadHygieneStatus = (typeof LEAD_HYGIENE_STATUSES)[number];

export const VISIT_TYPES = ['individual', 'group'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_STATUSES = [
  'pending_confirmation',
  'confirmed',
  'cancelled',
  'checked_in',
  'no_show',
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Status que ocupam o horário do coordenador (usados na constraint EXCLUDE). */
export const ACTIVE_VISIT_STATUSES: readonly VisitStatus[] = [
  'pending_confirmation',
  'confirmed',
  'checked_in',
];

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

/** Gatilhos da régua de comunicação (RF-05). */
export const COMMUNICATION_TRIGGERS = [
  'visit.created',
  'visit.confirmed',
  'visit.declined',
  'visit.cancelled',
  'reminder.day_before',
  'reminder.hour_before',
  'visit.completed',
] as const;
export type CommunicationTrigger = (typeof COMMUNICATION_TRIGGERS)[number];

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
