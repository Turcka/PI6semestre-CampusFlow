import type { Request } from 'express';
import type { z } from 'zod';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import type {
  answerSchema,
  createQuestionSchema,
  interestCategorySchema,
  listQuestionsQuerySchema,
  reorderQuestionsSchema,
  updateInterestCategorySchema,
  updateQuestionSchema,
} from './chatbot.schemas.js';
import { buildCandidateProfile, type ProfileQuestion } from './profile-builder.js';

type AnswerInput = z.infer<typeof answerSchema>;
type CreateQuestion = z.infer<typeof createQuestionSchema>;
type UpdateQuestion = z.infer<typeof updateQuestionSchema>;
type ReorderQuestions = z.infer<typeof reorderQuestionsSchema>;
type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
type CategoryInput = z.infer<typeof interestCategorySchema>;
type CategoryPatch = z.infer<typeof updateInterestCategorySchema>;

type SessionRow = { id: string; tenant_id: string; candidate_id: string | null; audience: string; status: string };
type QuestionRow = ProfileQuestion & { order_index: number; is_required: boolean; is_active: boolean };

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

async function getSession(sessionId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('chatbot_sessions')
    .select('id, tenant_id, candidate_id, audience, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Sessão do chatbot não encontrada.');
  return data as SessionRow;
}

async function getSessionQuestions(session: SessionRow) {
  const admin = getAdminClient();
  const { data: candidate, error: candidateError } = await admin
    .from('candidates')
    .select('course_id')
    .eq('id', session.candidate_id)
    .maybeSingle();
  if (candidateError) throw AppError.badRequest(candidateError.message);

  let q = admin
    .from('chatbot_questions')
    .select('id, key, prompt, kind, options, order_index, is_required, is_active')
    .eq('tenant_id', session.tenant_id)
    .eq('audience', 'candidato')
    .eq('is_active', true)
    .order('order_index');
  q = candidate?.course_id ? q.or(`course_id.is.null,course_id.eq.${candidate.course_id}`) : q.is('course_id', null);

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return (data ?? []) as QuestionRow[];
}

export async function getNextQuestion(sessionId: string) {
  const admin = getAdminClient();
  const session = await getSession(sessionId);
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

export async function saveAnswer(sessionId: string, input: AnswerInput) {
  const admin = getAdminClient();
  const session = await getSession(sessionId);
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

export async function reviewSession(sessionId: string) {
  const admin = getAdminClient();
  const session = await getSession(sessionId);
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

export async function completeSession(sessionId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc('build_candidate_profile', { p_session_id: sessionId });
  if (error) mapRpcError(error);

  const candidate = data as { id: string; profile_summary?: string | null; preferred_focus?: string | null };
  const { data: interests } = await admin
    .from('candidate_interests')
    .select('score, interest_categories(id, slug, name)')
    .eq('candidate_id', candidate.id)
    .order('score', { ascending: false });

  return { candidateId: candidate.id, summary: candidate.profile_summary ?? null, focus: candidate.preferred_focus ?? null, interests: interests ?? [] };
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
