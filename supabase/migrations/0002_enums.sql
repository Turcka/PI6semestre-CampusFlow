-- =============================================================================
-- 0002_enums.sql
-- Tipos ENUM de domínio. Devem espelhar packages/shared/src/enums.ts.
-- =============================================================================

create type public.user_role as enum ('admin', 'secretaria', 'coordenador', 'marketing', 'embaixador');

create type public.lead_status as enum ('novo', 'contatado', 'agendado', 'visitou', 'matriculado', 'perdido');

create type public.lead_hygiene_status as enum ('valid', 'duplicate', 'invalid');

create type public.lead_import_status as enum ('preview', 'confirmed', 'failed');

create type public.visit_type as enum ('individual', 'group');

create type public.visit_status as enum ('pending_confirmation', 'confirmed', 'cancelled', 'checked_in', 'no_show');

create type public.availability_exception_kind as enum ('block', 'extra');

create type public.message_channel as enum ('whatsapp', 'email');

create type public.message_status as enum ('queued', 'sent', 'delivered', 'read', 'opened', 'clicked', 'failed', 'bounced');

create type public.message_job_status as enum ('scheduled', 'enqueued', 'cancelled');

create type public.campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'cancelled');

create type public.communication_trigger as enum (
  'visit.created',
  'visit.confirmed',
  'visit.declined',
  'visit.cancelled',
  'reminder.day_before',
  'reminder.hour_before',
  'visit.completed'
);

create type public.poi_category as enum (
  'laboratorio',
  'biblioteca',
  'auditorio',
  'sala_de_aula',
  'alimentacao',
  'secretaria',
  'estacionamento',
  'portaria',
  'outro'
);

create type public.subscription_status as enum ('trial', 'active', 'past_due', 'cancelled');
