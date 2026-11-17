import type { ChatbotSessionMode } from '@campusflow/shared';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import type { ProfileQuestion } from './profile-builder.js';

/**
 * Leitura da sessão e das perguntas dela. Fica separado de `chatbot.service.ts` para ser usado
 * também pelo secretário virtual (`assistant/`) sem import circular.
 */

export type SessionAudience = 'candidato' | 'promotor';
export type SessionRow = {
  id: string;
  tenant_id: string;
  candidate_id: string | null;
  profile_id: string | null;
  audience: SessionAudience;
  status: string;
  /** `guided` = botões; `llm` = conversa com o secretário virtual. */
  mode: ChatbotSessionMode;
  llm_turns: number;
  llm_tokens_total: number;
  fallback_reason: string | null;
};
export type QuestionRow = ProfileQuestion & { order_index: number; is_required: boolean; is_active: boolean };

/**
 * Restrições aplicadas ao carregar a sessão:
 * - `audience`: a sessão precisa ser dessa audiência;
 * - `ownerProfileId` (promotor): a sessão precisa ser desse usuário;
 * - `candidateToken` (candidato): quando informado, precisa ser o `portal_token` do candidato da sessão.
 */
export type SessionExpectation = { audience: SessionAudience; ownerProfileId?: string; candidateToken?: string };

/** 403 quando o token não é o `portal_token` do candidato dono da sessão. */
async function assertCandidateToken(session: SessionRow, token: string) {
  if (!session.candidate_id) throw AppError.forbidden('Token do candidato inválido.');
  const admin = getAdminClient();
  const { data, error } = await admin.from('candidates').select('portal_token').eq('id', session.candidate_id).maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!data || data.portal_token !== token) throw AppError.forbidden('Token do candidato inválido.');
}

/**
 * Carrega a sessão. Quando `expected` é informado, garante a audiência (e, para promotor,
 * que a sessão pertence ao `ownerProfileId`) — evita que um promotor responda a sessão de outro.
 */
export async function getSession(sessionId: string, expected?: SessionExpectation) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('chatbot_sessions')
    .select('id, tenant_id, candidate_id, profile_id, audience, status, mode, llm_turns, llm_tokens_total, fallback_reason')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Sessão do chatbot não encontrada.');
  const session = data as SessionRow;
  if (expected && session.audience !== expected.audience) {
    throw AppError.notFound('Sessão do chatbot não encontrada.');
  }
  if (expected?.ownerProfileId && session.profile_id !== expected.ownerProfileId) {
    throw AppError.forbidden('Esta sessão pertence a outro usuário.');
  }
  if (expected?.candidateToken) await assertCandidateToken(session, expected.candidateToken);
  return session;
}

/**
 * Perguntas ativas da sessão (tenant + audiência + curso do candidato).
 * `known.courseId` evita reconsultar o candidato quando quem chama já tem esse dado.
 */
export async function getSessionQuestions(session: SessionRow, known?: { courseId: string | null }) {
  const admin = getAdminClient();

  let courseId: string | null = known?.courseId ?? null;
  if (!known && session.audience === 'candidato' && session.candidate_id) {
    const { data: candidate, error: candidateError } = await admin
      .from('candidates')
      .select('course_id')
      .eq('id', session.candidate_id)
      .maybeSingle();
    if (candidateError) throw AppError.badRequest(candidateError.message);
    courseId = candidate?.course_id ?? null;
  }

  let q = admin
    .from('chatbot_questions')
    .select('id, key, prompt, kind, options, order_index, is_required, is_active')
    .eq('tenant_id', session.tenant_id)
    .eq('audience', session.audience)
    .eq('is_active', true)
    .order('order_index');
  q = courseId ? q.or(`course_id.is.null,course_id.eq.${courseId}`) : q.is('course_id', null);

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return ((data ?? []) as QuestionRow[]).filter((question) => question.key !== 'disponibilidade');
}
