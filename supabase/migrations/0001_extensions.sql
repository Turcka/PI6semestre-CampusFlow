-- =============================================================================
-- 0001_extensions.sql
-- Extensões PostgreSQL necessárias ao CampusFlow.
-- =============================================================================

-- UUIDs, hashing e criptografia de campos sensíveis (LGPD)
create extension if not exists "pgcrypto" with schema extensions;

-- Necessária para a constraint EXCLUDE combinando igualdade (coordinator_id) e
-- sobreposição de intervalos (tstzrange) -> motor anti double-booking (RF-03)
create extension if not exists "btree_gist" with schema extensions;

-- Agendamento de jobs no banco: promoção de lembretes, no-show, métricas (RF-05, RNF-04)
create extension if not exists "pg_cron";

-- Filas de mensageria (Supabase Queues) consumidas pelo worker Node.js
create extension if not exists "pgmq";

-- Índices trigram para busca por nome/e-mail de leads
create extension if not exists "pg_trgm" with schema extensions;

-- Fila de saída de mensagens (WhatsApp / e-mail)
select pgmq.create('messages_outbound');

comment on extension "btree_gist" is 'Suporte a EXCLUDE (coordinator_id =, period &&) em visits';
comment on extension "pgmq" is 'Filas de mensageria consumidas por apps/api/src/jobs/worker.ts';
