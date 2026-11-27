import {
  MATRICULATION_PRIORITIES,
  aiInsightsSchema,
  type AiInsights,
  type AssistantSettings,
  type ChatbotSessionMode,
  type MatriculationPriority,
} from '@campusflow/shared';

import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { LlmError, generateStructured, isLlmEnabled, type LlmErrorKind } from '../../../integrations/llm/llm.client.js';
import { AppError } from '../../../utils/app-error.js';
import { getSession, getSessionQuestions, type QuestionRow, type SessionRow } from '../chatbot.session.js';
import * as repo from './assistant.repository.js';
import { synthesisResponseSchema, toValidAnswers, turnResponseSchema } from './extraction.js';
import { maskPii } from './pii.js';
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserMessage,
  buildTurnSystemPrompt,
  synthesisResponseJsonSchema,
  turnResponseJsonSchema,
} from './prompt.js';

/** Mensagens enviadas ao provedor a cada turno (as mais recentes). */
const HISTORY_LIMIT = 30;
/** A síntese devolve um JSON maior que o de um turno. */
const SYNTHESIS_MIN_OUTPUT_TOKENS = 1000;
const SYNTHESIS_MARKER = 'synthesis';

export type FallbackReason = LlmErrorKind | 'max_turns' | 'token_budget';

export type AssistantMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string };
export type QuickReply = { value: string; label: string };

export type AssistantTurnResponse = {
  message: AssistantMessage | null;
  extracted: Record<string, unknown>;
  rejected: string[];
  questionsForVisit: string[];
  quickReplies: QuickReply[];
  progress: number;
  done: boolean;
  turnsLeft: number;
  fallback: { mode: 'guided'; reason: FallbackReason } | null;
};

export type AssistantConversation = {
  mode: ChatbotSessionMode;
  status: string;
  progress: number;
  /** Todas as perguntas obrigatórias já foram respondidas (o visitante pode ir para a revisão). */
  done: boolean;
  turnsLeft: number;
  fallbackReason: string | null;
  messages: AssistantMessage[];
};

export type SynthesisOutcome = { summary: string; insights: AiInsights };

// -----------------------------------------------------------------------------
// Infra local
// -----------------------------------------------------------------------------

/**
 * Serializa as operações de uma mesma sessão dentro deste processo: evita dois turnos simultâneos
 * (contadores e histórico inconsistentes) e duas saudações geradas em paralelo.
 */
const sessionQueues = new Map<string, Promise<unknown>>();

async function withSessionLock<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const previous = sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  sessionQueues.set(sessionId, run);
  try {
    return await run;
  } finally {
    if (sessionQueues.get(sessionId) === run) sessionQueues.delete(sessionId);
  }
}

function toMessage(row: repo.MessageRow): AssistantMessage {
  return { id: row.id, role: row.role === 'user' ? 'user' : 'assistant', content: row.content, createdAt: row.created_at };
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || 'visitante';
}

/** Sessão de candidato + conferência do `portal_token` (403 quando não bate). */
async function authorize(sessionId: string, portalToken: string) {
  const session = await getSession(sessionId, { audience: 'candidato' });
  const candidate = session.candidate_id ? await repo.getCandidate(session.candidate_id) : null;
  if (!candidate || !portalToken || candidate.portal_token !== portalToken) {
    throw AppError.forbidden('Token do candidato inválido.');
  }
  return { session, candidate };
}

type Progress = {
  questions: QuestionRow[];
  pending: QuestionRow[];
  answeredKeys: string[];
  progress: number;
};

async function loadProgress(session: SessionRow, courseId: string | null): Promise<Progress> {
  const [questions, answers] = await Promise.all([getSessionQuestions(session, { courseId }), repo.listAnswers(session.id)]);
  const answered = new Set(answers.map((answer) => answer.question_id));
  const pending = questions.filter((question) => !answered.has(question.id));
  return {
    questions,
    pending,
    answeredKeys: questions.filter((question) => answered.has(question.id)).map((question) => question.key),
    progress: questions.length ? (questions.length - pending.length) / questions.length : 1,
  };
}

const hasRequiredPending = (pending: QuestionRow[]) => pending.some((question) => question.is_required);

function turnsLeft(session: Pick<SessionRow, 'llm_turns'>, assistant: AssistantSettings) {
  return Math.max(0, assistant.max_turns - session.llm_turns);
}

function quickRepliesFor(question: QuestionRow | undefined): QuickReply[] {
  if (!question) return [];
  if (question.kind === 'scale' && !question.options?.length) {
    return [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }));
  }
  if (question.kind === 'free_text') return [];
  return (question.options ?? []).map((option) => ({ value: String(option.value), label: option.label ?? String(option.value) }));
}

async function fallbackToGuided(session: SessionRow, reason: FallbackReason, progress: number): Promise<AssistantTurnResponse> {
  await repo.updateSession(session.id, { mode: 'guided', fallback_reason: reason });
  logger.info({ sessionId: session.id, reason }, 'Secretário virtual: sessão voltou para o questionário por botões');
  return {
    message: null,
    extracted: {},
    rejected: [],
    questionsForVisit: [],
    quickReplies: [],
    progress,
    done: false,
    turnsLeft: 0,
    fallback: { mode: 'guided', reason },
  };
}

/** Motivo para não chamar a LLM nesta sessão, ou `null` quando está tudo certo. */
function blockedReason(session: SessionRow, assistant: AssistantSettings): FallbackReason | null {
  if (!isLlmEnabled() || !assistant.enabled) return 'disabled';
  if (session.llm_turns >= assistant.max_turns) return 'max_turns';
  if (session.llm_tokens_total >= env.LLM_SESSION_TOKEN_BUDGET) return 'token_budget';
  return null;
}

type TurnInput = {
  session: SessionRow;
  candidate: repo.AssistantCandidate;
  context: repo.TenantContext;
  state: Progress;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
};

/** Monta o prompt (só primeiro nome, curso, campus e texto já mascarado) e chama o provedor. */
function requestTurn({ session, candidate, context, state, history }: TurnInput) {
  const system = buildTurnSystemPrompt({
    persona: { name: context.assistant.persona_name, tone: context.assistant.tone },
    tenantName: context.tenantName,
    campusName: context.campusName,
    courseName: context.courseName,
    candidateFirstName: firstName(candidate.full_name),
    facts: context.assistant.facts,
    pendingQuestions: state.pending.map((question) => ({
      key: question.key,
      prompt: question.prompt,
      kind: question.kind,
      options: (question.options ?? []).map((option) => ({ value: option.value, label: option.label })),
      isRequired: question.is_required,
    })),
    answeredKeys: state.answeredKeys,
    turnsLeft: turnsLeft(session, context.assistant),
  });

  return generateStructured({
    messages: [{ role: 'system', content: system }, ...history],
    schema: turnResponseSchema,
    jsonSchema: turnResponseJsonSchema,
    temperature: 0.3,
  });
}

// -----------------------------------------------------------------------------
// Conversa
// -----------------------------------------------------------------------------

/**
 * Processa uma mensagem do visitante: mascara PII, chama a LLM, valida o que foi extraído contra
 * as `options` das perguntas pendentes e grava apenas o que passou. Qualquer problema com a LLM
 * (ou limite de turnos/tokens) devolve `fallback` e a sessão segue pelo questionário por botões.
 */
export async function handleMessage(sessionId: string, portalToken: string, content: string): Promise<AssistantTurnResponse> {
  const { candidate } = await authorize(sessionId, portalToken);

  return withSessionLock(sessionId, async () => {
    // Relê a sessão dentro da fila: contadores e modo podem ter mudado no turno anterior.
    const session = await getSession(sessionId, { audience: 'candidato' });
    if (session.status === 'completed') throw AppError.conflict('SESSION_COMPLETED', 'Sessão do chatbot já foi concluída.');
    if (session.mode !== 'llm') throw AppError.conflict('SESSION_NOT_LLM', 'Esta sessão está no modo de perguntas por botões.');

    const [context, before] = await Promise.all([
      repo.getTenantContext(session.tenant_id, candidate.campus_id, candidate.course_id),
      loadProgress(session, candidate.course_id),
    ]);

    const blocked = blockedReason(session, context.assistant);
    if (blocked) return fallbackToGuided(session, blocked, before.progress);

    await repo.insertMessage({ session_id: sessionId, role: 'user', content: maskPii(content) });
    const history = await repo.listMessages(sessionId, { limit: HISTORY_LIMIT });

    let turn;
    try {
      turn = await requestTurn({
        session,
        candidate,
        context,
        state: before,
        history: history.map((message) => ({ role: message.role === 'user' ? 'user' : 'assistant', content: message.content })),
      });
    } catch (err) {
      if (err instanceof LlmError) return fallbackToGuided(session, err.kind, before.progress);
      throw err;
    }

    const { answers, accepted, rejected } = toValidAnswers(turn.data.extracted, before.pending);
    await repo.upsertAnswers(sessionId, answers);

    const answeredNow = new Set(answers.map((answer) => answer.questionId));
    const pending = before.pending.filter((question) => !answeredNow.has(question.id));
    const progress = before.questions.length ? (before.questions.length - pending.length) / before.questions.length : 1;
    const done = !hasRequiredPending(pending) && (turn.data.done || pending.length === 0);
    const questionsForVisit = turn.data.questionsForVisit.map((question) => maskPii(question));

    const message = await repo.insertMessage({
      session_id: sessionId,
      role: 'assistant',
      content: maskPii(turn.data.reply),
      extracted: { answers: accepted, rejected, questionsForVisit, offTopic: turn.data.offTopic },
      model: turn.model,
      tokens_in: turn.tokensIn,
      tokens_out: turn.tokensOut,
      latency_ms: turn.latencyMs,
    });

    const llmTurns = session.llm_turns + 1;
    await repo.updateSession(sessionId, {
      llm_turns: llmTurns,
      llm_tokens_total: session.llm_tokens_total + turn.tokensIn + turn.tokensOut,
    });

    logger.info(
      {
        sessionId,
        turn: llmTurns,
        accepted: Object.keys(accepted),
        rejected,
        offTopic: turn.data.offTopic,
        done,
        tokensIn: turn.tokensIn,
        tokensOut: turn.tokensOut,
        latencyMs: turn.latencyMs,
      },
      'Secretário virtual: turno processado',
    );

    const asked = done ? undefined : pending.find((question) => question.key === turn.data.nextQuestionKey);

    return {
      message: toMessage(message),
      extracted: accepted,
      rejected,
      questionsForVisit,
      quickReplies: quickRepliesFor(asked),
      progress,
      done,
      turnsLeft: turnsLeft({ llm_turns: llmTurns }, context.assistant),
      fallback: null,
    };
  });
}

/**
 * Gera a saudação (primeira mensagem `assistant`) quando a sessão `llm` ainda não tem mensagens.
 * Devolve `false` quando não foi possível — a sessão então já foi trocada para `guided`.
 */
export async function startAssistantSession(sessionId: string, portalToken: string): Promise<boolean> {
  const { candidate } = await authorize(sessionId, portalToken);

  return withSessionLock(sessionId, async () => {
    const session = await getSession(sessionId, { audience: 'candidato' });
    if (session.mode !== 'llm' || session.status === 'completed') return false;
    // Outra requisição pode ter gerado a saudação enquanto esta esperava na fila.
    if ((await repo.listMessages(sessionId, { limit: 1 })).length) return true;

    const [context, state] = await Promise.all([
      repo.getTenantContext(session.tenant_id, candidate.campus_id, candidate.course_id),
      loadProgress(session, candidate.course_id),
    ]);

    const blocked = blockedReason(session, context.assistant);
    if (blocked) {
      await fallbackToGuided(session, blocked, state.progress);
      return false;
    }

    let turn;
    try {
      turn = await requestTurn({ session, candidate, context, state, history: [] });
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      await fallbackToGuided(session, err.kind, state.progress);
      return false;
    }

    // Sem mensagem do visitante não há o que extrair: qualquer `extracted` da saudação é ignorado.
    await repo.insertMessage({
      session_id: sessionId,
      role: 'assistant',
      content: maskPii(turn.data.reply),
      model: turn.model,
      tokens_in: turn.tokensIn,
      tokens_out: turn.tokensOut,
      latency_ms: turn.latencyMs,
    });
    await repo.updateSession(sessionId, { llm_tokens_total: session.llm_tokens_total + turn.tokensIn + turn.tokensOut });
    return true;
  });
}

/** Histórico para o front (retomada após refresh). Gera a saudação na primeira leitura. */
export async function listMessages(sessionId: string, portalToken: string): Promise<AssistantConversation> {
  const { session: initial, candidate } = await authorize(sessionId, portalToken);

  let session = initial;
  let messages = await repo.listMessages(sessionId);
  if (session.mode === 'llm' && session.status !== 'completed' && messages.length === 0) {
    await startAssistantSession(sessionId, portalToken);
    [session, messages] = await Promise.all([getSession(sessionId, { audience: 'candidato' }), repo.listMessages(sessionId)]);
  }

  const [assistant, state] = await Promise.all([
    repo.getAssistantSettings(session.tenant_id),
    loadProgress(session, candidate.course_id),
  ]);

  return {
    mode: session.mode,
    status: session.status,
    progress: session.status === 'completed' ? 1 : state.progress,
    done: session.status === 'completed' || !hasRequiredPending(state.pending),
    turnsLeft: session.mode === 'llm' ? turnsLeft(session, assistant) : 0,
    fallbackReason: session.fallback_reason,
    messages: messages.map(toMessage),
  };
}

/** Troca o modo da sessão. `llm` só é aceito com a LLM ligada e o assistente habilitado no tenant. */
export async function setMode(sessionId: string, portalToken: string, mode: ChatbotSessionMode) {
  const { session, candidate } = await authorize(sessionId, portalToken);
  if (session.status === 'completed') throw AppError.conflict('SESSION_COMPLETED', 'Sessão do chatbot já foi concluída.');

  if (mode !== session.mode) {
    if (mode === 'llm') {
      const assistant = await repo.getAssistantSettings(session.tenant_id);
      if (!isLlmEnabled() || !assistant.enabled) {
        throw AppError.conflict('ASSISTANT_UNAVAILABLE', 'O assistente virtual não está disponível no momento.');
      }
      await repo.updateSession(sessionId, { mode: 'llm', fallback_reason: null });
    } else {
      await repo.updateSession(sessionId, { mode: 'guided', fallback_reason: 'user_choice' });
    }
  }

  const state = await loadProgress(session, candidate.course_id);
  return { mode, progress: state.progress, question: state.pending[0] ?? null, isLast: state.pending.length <= 1 };
}

// -----------------------------------------------------------------------------
// Síntese
// -----------------------------------------------------------------------------

function selectedValues(value: unknown): Array<string | number> {
  if (typeof value === 'string' || typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.values)) return selectedValues(record.values);
    if (record.value !== undefined) return selectedValues(record.value);
  }
  return [];
}

/** Resposta estruturada em texto legível (labels das opções); texto livre sai mascarado. */
function describeAnswer(question: QuestionRow, value: unknown): string {
  const selected = selectedValues(value);
  if (question.kind === 'free_text') return maskPii(selected.map(String).join(' ')).slice(0, 500);
  if (question.kind === 'scale') return selected.length ? `${selected[0]} de 5` : '';
  return selected
    .map((item) => {
      const option = (question.options ?? []).find((candidate) => String(candidate.value) === String(item));
      return option?.label ?? String(item);
    })
    .join('; ');
}

/** Prioridades a partir da resposta estruturada `prioridades_matricula` (ordem = rank). */
function prioritiesFromAnswer(value: unknown): AiInsights['priorities'] {
  const allowed = MATRICULATION_PRIORITIES as readonly string[];
  const keys = [...new Set(selectedValues(value).map(String))].filter((key) => allowed.includes(key)) as MatriculationPriority[];
  return keys.map((key, index) => ({ key, rank: index + 1 }));
}

/**
 * Gera o resumo em linguagem natural e os insights da conversa. Chamado por `completeSession`
 * depois de `build_candidate_profile`. Devolve `null` quando não houve conversa (sessão só por
 * botões) ou quando a LLM está desligada; lança `LlmError` se o provedor falhar — quem chama
 * mantém o resumo determinístico.
 */
export async function synthesize(sessionId: string): Promise<SynthesisOutcome | null> {
  const session = await getSession(sessionId, { audience: 'candidato' });
  if (!session.candidate_id) return null;

  const transcript = await repo.listMessages(sessionId);
  if (!transcript.some((message) => message.role === 'user')) return null;

  const candidate = await repo.getCandidate(session.candidate_id);
  if (!candidate) return null;

  // `complete` repetido: build_candidate_profile regravou o resumo determinístico; restaura o
  // resultado da síntese já feita em vez de pagar outra chamada.
  if (await repo.hasSynthesis(sessionId)) {
    const stored = aiInsightsSchema.safeParse(candidate.ai_insights);
    if (stored.success && stored.data.summary) {
      await repo.saveInsights(candidate.id, stored.data.summary, stored.data);
      return { summary: stored.data.summary, insights: stored.data };
    }
  }

  if (!isLlmEnabled()) return null;
  const context = await repo.getTenantContext(session.tenant_id, candidate.campus_id, candidate.course_id);
  if (!context.assistant.enabled) return null;

  const [questions, answers, interests] = await Promise.all([
    getSessionQuestions(session, { courseId: candidate.course_id }),
    repo.listAnswers(sessionId),
    repo.listInterestNames(candidate.id),
  ]);
  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer.value]));
  const name = firstName(candidate.full_name);

  const result = await generateStructured({
    messages: [
      {
        role: 'system',
        content: buildSynthesisSystemPrompt({
          persona: { name: context.assistant.persona_name, tone: context.assistant.tone },
          tenantName: context.tenantName,
          campusName: context.campusName,
          courseName: context.courseName,
          candidateFirstName: name,
        }),
      },
      {
        role: 'user',
        content: buildSynthesisUserMessage(
          {
            transcript: transcript.map((message) => ({
              role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
              content: message.content,
            })),
            answers: questions
              .filter((question) => answerByQuestion.has(question.id))
              .map((question) => ({
                key: question.key,
                prompt: question.prompt,
                answer: describeAnswer(question, answerByQuestion.get(question.id)),
              }))
              .filter((answer) => answer.answer),
            profile: { focus: candidate.preferred_focus, interests },
          },
          name,
        ),
      },
    ],
    schema: synthesisResponseSchema,
    jsonSchema: synthesisResponseJsonSchema,
    temperature: 0.2,
    maxOutputTokens: Math.max(env.LLM_MAX_OUTPUT_TOKENS, SYNTHESIS_MIN_OUTPUT_TOKENS),
  });

  // A resposta estruturada (validada contra as options) é a fonte quando a LLM não ranqueou nada.
  const prioritiesQuestion = questions.find((question) => question.key === 'prioridades_matricula');
  const priorities = result.data.insights.priorities.length
    ? result.data.insights.priorities
    : prioritiesFromAnswer(prioritiesQuestion ? answerByQuestion.get(prioritiesQuestion.id) : undefined);

  const insights = aiInsightsSchema.parse({
    ...result.data.insights,
    priorities,
    summary: result.data.summary,
    model: result.model,
    generatedAt: new Date().toISOString(),
  });

  await repo.saveInsights(candidate.id, result.data.summary, insights);
  await repo.insertMessage({
    session_id: sessionId,
    role: 'system',
    content: SYNTHESIS_MARKER,
    model: result.model,
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    latency_ms: result.latencyMs,
  });
  await repo.updateSession(sessionId, { llm_tokens_total: session.llm_tokens_total + result.tokensIn + result.tokensOut });

  logger.info(
    { sessionId, tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs: result.latencyMs, priorities: priorities.length },
    'Secretário virtual: síntese gerada',
  );

  return { summary: result.data.summary, insights };
}
