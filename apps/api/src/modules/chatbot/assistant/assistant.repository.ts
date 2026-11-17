import type { AiInsights, AssistantSettings } from '@campusflow/shared';

import { env } from '../../../config/env.js';
import { getAdminClient } from '../../../config/supabase.js';
import { AppError } from '../../../utils/app-error.js';
import { resolveAssistantSettings } from './settings.js';

/** `max_turns` do tenant prevalece; LLM_MAX_TURNS só vale quando o tenant não configurou. */
const settingsDefaults = () => ({ max_turns: Math.min(40, Math.max(4, env.LLM_MAX_TURNS)) });

/**
 * Acesso a dados do secretário virtual (service role). Isolado do orquestrador para que os testes
 * possam substituir o banco por um estado em memória.
 */

export type AssistantCandidate = {
  id: string;
  tenant_id: string;
  full_name: string;
  portal_token: string;
  course_id: string | null;
  campus_id: string | null;
  preferred_focus: string | null;
  ai_insights: unknown;
};

export type MessageRole = 'system' | 'user' | 'assistant';

export type MessageRow = {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
};

export type NewMessage = {
  session_id: string;
  role: MessageRole;
  content: string;
  extracted?: Record<string, unknown>;
  model?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  latency_ms?: number | null;
};

export type SessionPatch = {
  mode?: 'guided' | 'llm';
  llm_turns?: number;
  llm_tokens_total?: number;
  fallback_reason?: string | null;
};

export type TenantContext = {
  tenantName: string;
  campusName: string;
  courseName: string | null;
  assistant: AssistantSettings;
};

export async function getCandidate(candidateId: string): Promise<AssistantCandidate | null> {
  const { data, error } = await getAdminClient()
    .from('candidates')
    .select('id, tenant_id, full_name, portal_token, course_id, campus_id, preferred_focus, ai_insights')
    .eq('id', candidateId)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  return (data as AssistantCandidate | null) ?? null;
}

export async function getTenantContext(tenantId: string, campusId: string | null, courseId: string | null): Promise<TenantContext> {
  const admin = getAdminClient();
  const [tenant, campus, course] = await Promise.all([
    admin.from('tenants').select('name, settings').eq('id', tenantId).maybeSingle(),
    campusId ? admin.from('campuses').select('name').eq('id', campusId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    courseId ? admin.from('courses').select('name').eq('id', courseId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (tenant.error) throw AppError.badRequest(tenant.error.message);

  return {
    tenantName: (tenant.data?.name as string | undefined) ?? 'instituição',
    campusName: (campus.data?.name as string | undefined) ?? 'principal',
    courseName: (course.data?.name as string | undefined) ?? null,
    assistant: resolveAssistantSettings(tenant.data?.settings, settingsDefaults()),
  };
}

export async function getAssistantSettings(tenantId: string): Promise<AssistantSettings> {
  const { data, error } = await getAdminClient().from('tenants').select('settings').eq('id', tenantId).maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  return resolveAssistantSettings(data?.settings, settingsDefaults());
}

export async function listAnswers(sessionId: string): Promise<Array<{ question_id: string; value: unknown }>> {
  const { data, error } = await getAdminClient().from('chatbot_answers').select('question_id, value').eq('session_id', sessionId);
  if (error) throw AppError.badRequest(error.message);
  return (data ?? []) as Array<{ question_id: string; value: unknown }>;
}

/** Mensagens `user`/`assistant` em ordem cronológica. Com `limit`, devolve as últimas N. */
export async function listMessages(sessionId: string, options: { limit?: number } = {}): Promise<MessageRow[]> {
  let query = getAdminClient()
    .from('chatbot_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false });
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw AppError.badRequest(error.message);
  return ((data ?? []) as MessageRow[]).reverse();
}

export async function hasSynthesis(sessionId: string): Promise<boolean> {
  const { count, error } = await getAdminClient()
    .from('chatbot_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('role', 'system')
    .eq('content', 'synthesis');
  if (error) throw AppError.badRequest(error.message);
  return (count ?? 0) > 0;
}

export async function insertMessage(message: NewMessage): Promise<MessageRow> {
  const { data, error } = await getAdminClient()
    .from('chatbot_messages')
    .insert({ ...message, extracted: message.extracted ?? {} })
    .select('id, role, content, created_at')
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data as MessageRow;
}

/** Upsert em lote, com a mesma chave (session_id, question_id) usada por `saveAnswer`. */
export async function upsertAnswers(sessionId: string, answers: Array<{ questionId: string; value: unknown }>) {
  if (!answers.length) return;
  const answeredAt = new Date().toISOString();
  const { error } = await getAdminClient()
    .from('chatbot_answers')
    .upsert(
      answers.map((answer) => ({ session_id: sessionId, question_id: answer.questionId, value: answer.value, answered_at: answeredAt })),
      { onConflict: 'session_id,question_id' },
    );
  if (error) throw AppError.badRequest(error.message);
}

export async function updateSession(sessionId: string, patch: SessionPatch) {
  const { error } = await getAdminClient().from('chatbot_sessions').update(patch).eq('id', sessionId);
  if (error) throw AppError.badRequest(error.message);
}

export async function saveInsights(candidateId: string, summary: string, insights: AiInsights) {
  const { error } = await getAdminClient()
    .from('candidates')
    .update({ profile_summary: summary, ai_insights: insights })
    .eq('id', candidateId);
  if (error) throw AppError.badRequest(error.message);
}

export async function listInterestNames(candidateId: string): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('candidate_interests')
    .select('score, interest_categories(name)')
    .eq('candidate_id', candidateId)
    .order('score', { ascending: false })
    .limit(5);
  if (error) throw AppError.badRequest(error.message);
  return (data ?? [])
    .map((row) => {
      const category = row.interest_categories as { name?: string } | Array<{ name?: string }> | null;
      return Array.isArray(category) ? category[0]?.name : category?.name;
    })
    .filter((name): name is string => Boolean(name));
}
