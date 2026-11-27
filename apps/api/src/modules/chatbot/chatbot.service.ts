import type { AiInsights } from '@campusflow/shared';
import type { Request } from 'express';
import type { z } from 'zod';

import { logger } from '../../config/logger.js';
import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import { synthesize } from './assistant/assistant.service.js';
import type {
  answerSchema,
  createQuestionSchema,
  interestCategorySchema,
  listQuestionsQuerySchema,
  reorderQuestionsSchema,
  updateInterestCategorySchema,
  updateQuestionSchema,
} from './chatbot.schemas.js';
import { getSession, getSessionQuestions, type SessionExpectation } from './chatbot.session.js';
import { buildCandidateProfile } from './profile-builder.js';

type AnswerInput = z.infer<typeof answerSchema>;
type CreateQuestion = z.infer<typeof createQuestionSchema>;
type UpdateQuestion = z.infer<typeof updateQuestionSchema>;
type ReorderQuestions = z.infer<typeof reorderQuestionsSchema>;
type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
type CategoryInput = z.infer<typeof interestCategorySchema>;
type CategoryPatch = z.infer<typeof updateInterestCategorySchema>;

export { getSession, getSessionQuestions } from './chatbot.session.js';
export type { QuestionRow, SessionAudience, SessionExpectation, SessionRow } from './chatbot.session.js';

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function getNextQuestion(sessionId: string, expected?: SessionExpectation) {
  const admin = getAdminClient();
  const session = await getSession(sessionId, expected);
  if (session.status === 'completed') return { question: null, progress: 1, isLast: true };

  const [questions, answersResult] = await Promise.all([
    getSessionQuestions(session),
    admin.from('chatbot_answers').select('question_id').eq('session_id', sessionId),
  ]);
  if (answersResult.error) throw AppError.badRequest(answersResult.error.message);

  const answered = new Set(((answersResult.data ?? []) as Array<{ question_id: string }>).map((row) => row.question_id));
  const unanswered = questions.filter((question) => !answered.has(question.id));

  return {
    question: unanswered[0] ?? null,
    progress: questions.length ? answered.size / questions.length : 1,
    isLast: unanswered.length <= 1,
  };
}

export async function saveAnswer(sessionId: string, input: AnswerInput, expected?: SessionExpectation) {
  const admin = getAdminClient();
  const session = await getSession(sessionId, expected);
  if (session.status === 'completed') throw AppError.conflict('SESSION_COMPLETED', 'Sessão do chatbot já foi concluída.');

  const questions = await getSessionQuestions(session);
  if (!questions.some((question) => question.id === input.questionId)) {
    throw AppError.badRequest('Pergunta não pertence a esta sessão.');
  }

  const { data, error } = await admin
    .from('chatbot_answers')
    .upsert({ session_id: sessionId, question_id: input.questionId, value: input.value, answered_at: new Date().toISOString() }, { onConflict: 'session_id,question_id' })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function reviewSession(sessionId: string, expected?: SessionExpectation) {
  const admin = getAdminClient();
  const session = await getSession(sessionId, expected);
  const { data, error } = await admin
    .from('chatbot_answers')
    .select('*, chatbot_questions(id, key, prompt, kind, options, order_index)')
    .eq('session_id', sessionId)
    .order('answered_at');
  if (error) throw AppError.badRequest(error.message);

  const questions = await getSessionQuestions(session);
  const preview = buildCandidateProfile(
    (data ?? []).map((answer) => ({ questionId: answer.question_id, value: answer.value })),
    questions.map((question) => ({ id: question.id, key: question.key, prompt: question.prompt, kind: question.kind, options: question.options ?? [] })),
  );

  return { session, answers: data ?? [], preview };
}

export async function completeSession(sessionId: string, candidateToken?: string) {
  const admin = getAdminClient();
  await getSession(sessionId, { audience: 'candidato', candidateToken });
  const { data, error } = await admin.rpc('build_candidate_profile', { p_session_id: sessionId });
  if (error) mapRpcError(error);

  const candidate = data as { id: string; profile_summary?: string | null; preferred_focus?: string | null };

  // Síntese do secretário virtual: só roda se houve conversa. Qualquer falha mantém o resumo
  // determinístico gravado por build_candidate_profile — a conclusão nunca fica bloqueada pela LLM.
  let summary = candidate.profile_summary ?? null;
  let insights: AiInsights | null = null;
  try {
    const synthesis = await synthesize(sessionId);
    if (synthesis) {
      summary = synthesis.summary;
      insights = synthesis.insights;
    }
  } catch (err) {
    logger.warn({ sessionId, reason: err instanceof Error ? err.message : 'erro desconhecido' }, 'Síntese do secretário virtual falhou');
  }

  const { data: interests } = await admin
    .from('candidate_interests')
    .select('score, interest_categories(id, slug, name)')
    .eq('candidate_id', candidate.id)
    .order('score', { ascending: false });

  return { candidateId: candidate.id, summary, focus: candidate.preferred_focus ?? null, interests: interests ?? [], insights };
}

export async function listQuestions(req: Request, query: ListQuestionsQuery) {
  const { user, supabase } = requireUser(req);
  let q = supabase.from('chatbot_questions').select('*').eq('tenant_id', user.tenantId).order('order_index');
  if (query.audience) q = q.eq('audience', query.audience);
  if (query.courseId) q = q.eq('course_id', query.courseId);
  if (!query.includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createQuestion(req: Request, input: CreateQuestion) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('chatbot_questions')
    .insert({
      tenant_id: user.tenantId,
      course_id: input.courseId ?? null,
      audience: input.audience,
      key: input.key,
      prompt: input.prompt,
      kind: input.kind,
      options: input.options,
      order_index: input.orderIndex,
      is_required: input.isRequired,
      is_active: input.isActive,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updateQuestion(req: Request, questionId: string, input: UpdateQuestion) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.courseId !== undefined) patch.course_id = input.courseId;
  if (input.audience !== undefined) patch.audience = input.audience;
  if (input.key !== undefined) patch.key = input.key;
  if (input.prompt !== undefined) patch.prompt = input.prompt;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.options !== undefined) patch.options = input.options;
  if (input.orderIndex !== undefined) patch.order_index = input.orderIndex;
  if (input.isRequired !== undefined) patch.is_required = input.isRequired;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase.from('chatbot_questions').update(patch).eq('id', questionId).eq('tenant_id', user.tenantId).select().single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Pergunta não encontrada.');
  return data;
}

export async function deleteQuestion(req: Request, questionId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase.from('chatbot_questions').update({ is_active: false }).eq('id', questionId).eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}

export async function reorderQuestions(req: Request, input: ReorderQuestions) {
  const { user, supabase } = requireUser(req);
  const results = await Promise.all(
    input.questionIds.map((id, orderIndex) => supabase.from('chatbot_questions').update({ order_index: orderIndex }).eq('id', id).eq('tenant_id', user.tenantId)),
  );
  const error = results.find((result) => result.error)?.error;
  if (error) throw AppError.badRequest(error.message);
  return { reordered: input.questionIds.length };
}

export async function listInterestCategories(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.from('interest_categories').select('*').eq('tenant_id', user.tenantId).order('name');
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createInterestCategory(req: Request, input: CategoryInput) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('interest_categories')
    .insert({ tenant_id: user.tenantId, slug: input.slug, name: input.name, description: input.description ?? null, is_active: input.isActive ?? true })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updateInterestCategory(req: Request, categoryId: string, input: CategoryPatch) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  const { data, error } = await supabase.from('interest_categories').update(patch).eq('id', categoryId).eq('tenant_id', user.tenantId).select().single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Categoria de interesse não encontrada.');
  return data;
}

export async function deleteInterestCategory(req: Request, categoryId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase.from('interest_categories').update({ is_active: false }).eq('id', categoryId).eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}
