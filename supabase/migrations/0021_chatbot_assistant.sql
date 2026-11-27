-- =============================================================================
-- 0021_chatbot_assistant.sql
-- Secretário virtual com LLM: mensagens, modo da sessão, insights e prioridades
-- (docs/plano-llm-secretario-virtual.md, Fase 1)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sessão: modo de condução e contadores de uso
-- -----------------------------------------------------------------------------
alter table public.chatbot_sessions
  add column if not exists mode             text not null default 'guided'
    check (mode in ('guided', 'llm')),
  add column if not exists llm_turns        integer not null default 0,
  add column if not exists llm_tokens_total integer not null default 0,
  add column if not exists fallback_reason  text;

-- -----------------------------------------------------------------------------
-- Transcrição da conversa
-- -----------------------------------------------------------------------------
create table public.chatbot_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.chatbot_sessions(id) on delete cascade,
  role        text not null check (role in ('system', 'user', 'assistant')),
  content     text not null,
  extracted   jsonb not null default '{}'::jsonb,   -- { "<question_key>": <value> } validado
  model       text,
  tokens_in   integer,
  tokens_out  integer,
  latency_ms  integer,
  created_at  timestamptz not null default now()
);

create index chatbot_messages_session_idx
  on public.chatbot_messages (session_id, created_at);

alter table public.chatbot_messages enable row level security;

-- Admin do tenant lê a transcrição; promotor/professor não (vêem só ai_insights via briefing).
create policy chatbot_messages_select on public.chatbot_messages for select
  using (exists (
    select 1 from public.chatbot_sessions s
    where s.id = session_id
      and public.is_tenant_member(s.tenant_id)
      and public.has_role('admin')
  ));
-- Escrita apenas pelo service role (API). Nenhuma policy de insert/update/delete.

-- -----------------------------------------------------------------------------
-- Insights gerados pela síntese
-- -----------------------------------------------------------------------------
alter table public.candidates
  add column if not exists ai_insights jsonb not null default '{}'::jsonb;
-- Formato (ver Anexo B do plano / aiInsightsSchema em @campusflow/shared):
-- {
--   "summary": "...",
--   "priorities": [{"key":"empregabilidade","rank":1,"evidence":"..."}, ...],
--   "goals": ["..."], "doubts": ["..."], "objections": ["..."],
--   "decisionStage": "explorando|comparando|decidido",
--   "influencers": ["pais","amigos","escola","sozinho"],
--   "schoolMoment": "em2|em3|concluido|transferencia|outro",
--   "decisionTimeline": "este_semestre|proximo_semestre|proximo_ano|indefinido",
--   "suggestedFocus": "tecnico|academico|profissional|institucional",
--   "talkingPoints": ["..."],
--   "model": "...", "generatedAt": "..."
-- }

create index if not exists candidates_ai_insights_priorities_idx
  on public.candidates using gin ((ai_insights -> 'priorities'));

-- -----------------------------------------------------------------------------
-- Configuração do assistente por tenant (merge no jsonb existente)
-- -----------------------------------------------------------------------------
update public.tenants
set settings = settings || jsonb_build_object('assistant', jsonb_build_object(
  'enabled', false,
  'persona_name', 'Sofia',
  'tone', 'acolhedor e direto',
  'facts', '[]'::jsonb,            -- [{"topic":"bolsas","text":"..."}]
  'max_turns', 16
))
where not (settings ? 'assistant');

-- -----------------------------------------------------------------------------
-- LGPD: anonimização passa a limpar transcrição e insights
-- -----------------------------------------------------------------------------
-- Correção de bug anterior a esta migração: anonymize_candidate zera email e phone, o que
-- violava leads_contact_required (0004) — a função falhava com 23514 desde a 0016 e nenhum
-- candidato chegava a ser anonimizado. Registros anonimizados ficam dispensados do contato.
alter table public.candidates drop constraint if exists leads_contact_required;
alter table public.candidates add constraint leads_contact_required
  check (email is not null or phone is not null or anonymized_at is not null);

create or replace function public.anonymize_candidate(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.candidates
  set
    full_name = 'Anonimizado',
    email = null,
    phone = null,
    cpf = null,
    profile_summary = null,
    behavioral_profile = '{}'::jsonb,
    availability_windows = '[]'::jsonb,
    ai_insights = '{}'::jsonb,
    anonymized_at = now(),
    metadata = '{}'::jsonb
  where id = p_candidate_id and anonymized_at is null;

  update public.chatbot_answers a
  set value = '{"anonymized": true}'::jsonb
  from public.chatbot_sessions s
  where s.id = a.session_id and s.candidate_id = p_candidate_id;

  update public.chatbot_messages m
  set content = '[anonimizado]', extracted = '{}'::jsonb
  from public.chatbot_sessions s
  where s.id = m.session_id and s.candidate_id = p_candidate_id;

  update public.message_logs set to_address = '[anonimizado]' where candidate_id = p_candidate_id;
  update public.message_jobs set status = 'cancelled'
  where candidate_id = p_candidate_id and status = 'scheduled';
end;
$$;

-- Retenção específica da transcrição (180 dias após a conclusão da sessão)
create or replace function public.purge_chatbot_transcripts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  with purged as (
    update public.chatbot_messages m
    set content = '[expirado]', extracted = '{}'::jsonb
    from public.chatbot_sessions s
    where s.id = m.session_id
      and s.completed_at < now() - interval '180 days'
      and m.content <> '[expirado]'
    returning m.id
  )
  select count(*) into v_count from purged;
  return v_count;
end;
$$;

select cron.schedule('purge-chatbot-transcripts', '30 3 * * *',
  $$ select public.purge_chatbot_transcripts(); $$);

-- -----------------------------------------------------------------------------
-- View para o dashboard: prioridades de matrícula por curso
-- -----------------------------------------------------------------------------
create or replace view public.vw_candidate_priorities as
select
  c.tenant_id,
  c.course_id,
  co.name as course_name,
  p ->> 'key' as priority_key,
  (p ->> 'rank')::int as rank,
  count(*) as candidates
from public.candidates c
left join public.courses co on co.id = c.course_id
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(c.ai_insights -> 'priorities') = 'array' then c.ai_insights -> 'priorities'
    else '[]'::jsonb
  end
) p
where c.anonymized_at is null
group by c.tenant_id, c.course_id, co.name, p ->> 'key', (p ->> 'rank')::int;

alter view public.vw_candidate_priorities set (security_invoker = on);
