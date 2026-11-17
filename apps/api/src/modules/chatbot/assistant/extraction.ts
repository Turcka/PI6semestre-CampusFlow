import {
  DECISION_INFLUENCERS,
  DECISION_STAGES,
  DECISION_TIMELINES,
  MATRICULATION_PRIORITIES,
  SCHOOL_MOMENTS,
  VISIT_FOCUSES,
  aiInsightsSchema,
  type AiInsights,
} from '@campusflow/shared';
import { z } from 'zod';

import type { ProfileQuestion } from '../profile-builder.js';
import { maskPii } from './pii.js';

const FREE_TEXT_MAX = 500;

/** A LLM às vezes devolve `null` onde o contrato pede lista/objeto; tratamos como ausente. */
const nullToUndefined = (value: unknown) => (value === null ? undefined : value);

/** Saída de um turno da conversa (Anexo A.1). */
export const turnResponseSchema = z.object({
  reply: z.string().trim().min(1).max(700),
  extracted: z.preprocess(nullToUndefined, z.record(z.unknown()).default({})),
  nextQuestionKey: z.preprocess(nullToUndefined, z.string().max(60).optional()),
  questionsForVisit: z.preprocess(nullToUndefined, z.array(z.string().max(200)).max(5).default([])),
  offTopic: z.preprocess(nullToUndefined, z.boolean().default(false)),
  done: z.preprocess(nullToUndefined, z.boolean().default(false)),
});
export type TurnResponse = z.infer<typeof turnResponseSchema>;

export type ValidAnswer = { questionId: string; key: string; value: Record<string, unknown> };

export type ValidAnswersResult = {
  /** Respostas no formato de `chatbotAnswerSchema`, prontas para gravar. */
  answers: ValidAnswer[];
  /** `{ key: valor }` apenas com o que foi aceito (devolvido ao front e gravado na mensagem). */
  accepted: Record<string, unknown>;
  /** Keys descartadas: inexistentes, não pendentes ou com valor fora das options. */
  rejected: string[];
};

export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** `x`, `{ value: x }` ou `[x]` -> `x`; qualquer outra coisa -> undefined. */
function unwrapScalar(raw: unknown): string | number | undefined {
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  if (Array.isArray(raw)) return raw.length === 1 ? unwrapScalar(raw[0]) : undefined;
  if (raw && typeof raw === 'object' && 'value' in raw) return unwrapScalar((raw as { value: unknown }).value);
  return undefined;
}

/** `[a, b]`, `{ values: [a, b] }` ou `a` -> lista de escalares. */
function unwrapList(raw: unknown): Array<string | number> {
  if (Array.isArray(raw)) return raw.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
  if (raw && typeof raw === 'object' && 'values' in raw) return unwrapList((raw as { values: unknown }).values);
  const scalar = unwrapScalar(raw);
  return scalar === undefined ? [] : [scalar];
}

/** Casa pelo `value` (comparação por String) ou pelo `label` normalizado; devolve o `value` cadastrado. */
function matchOption(question: ProfileQuestion, candidate: string | number): string | number | undefined {
  const asString = String(candidate).trim();
  const byValue = question.options.find((option) => String(option.value) === asString);
  if (byValue) return byValue.value;
  const normalized = normalizeText(asString);
  const byLabel = question.options.find(
    (option) => normalizeText(String(option.value)) === normalized || (option.label && normalizeText(option.label) === normalized),
  );
  return byLabel?.value;
}

function validateValue(question: ProfileQuestion, raw: unknown): Record<string, unknown> | null {
  switch (question.kind) {
    case 'single_choice': {
      const scalar = unwrapScalar(raw);
      if (scalar === undefined) return null;
      const value = matchOption(question, scalar);
      return value === undefined ? null : { value };
    }
    case 'multi_choice': {
      const values: string[] = [];
      for (const item of unwrapList(raw)) {
        const value = matchOption(question, item);
        // Preserva a ordem devolvida pela LLM (rank de importância) e remove repetidos.
        if (value !== undefined && !values.includes(String(value))) values.push(String(value));
      }
      return values.length ? { values } : null;
    }
    case 'scale': {
      const scalar = unwrapScalar(raw);
      const numeric = typeof scalar === 'string' && scalar.trim() !== '' ? Number(scalar) : scalar;
      if (typeof numeric !== 'number' || !Number.isInteger(numeric) || numeric < 1 || numeric > 5) return null;
      return { value: numeric };
    }
    case 'free_text': {
      const scalar = unwrapScalar(raw);
      if (typeof scalar !== 'string') return null;
      const text = maskPii(scalar.trim()).slice(0, FREE_TEXT_MAX);
      return text ? { value: text } : null;
    }
    default:
      return null;
  }
}

/**
 * Converte `extracted` em respostas válidas no formato de `chatbotAnswerSchema`; descarta o resto.
 * `pendingQuestions` deve conter só as perguntas ainda não respondidas: keys fora dessa lista são
 * rejeitadas, o que impede a LLM de sobrescrever respostas já dadas ou inventar perguntas.
 */
export function toValidAnswers(extracted: Record<string, unknown>, pendingQuestions: ProfileQuestion[]): ValidAnswersResult {
  const byKey = new Map(pendingQuestions.map((question) => [question.key, question]));
  const result: ValidAnswersResult = { answers: [], accepted: {}, rejected: [] };

  for (const [key, raw] of Object.entries(extracted)) {
    const question = byKey.get(key);
    const value = question ? validateValue(question, raw) : null;
    if (!question || !value) {
      result.rejected.push(key);
      continue;
    }
    result.answers.push({ questionId: question.id, key, value });
    result.accepted[key] = 'values' in value ? value.values : value.value;
  }

  return result;
}

// -----------------------------------------------------------------------------
// Síntese
// -----------------------------------------------------------------------------

function cleanStrings(raw: unknown, maxItems: number, maxLength = 200): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = maskPii(item.trim()).slice(0, maxLength);
    if (text && !out.includes(text)) out.push(text);
    if (out.length === maxItems) break;
  }
  return out;
}

function pickEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function pickEnums<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    const value = pickEnum(item, allowed);
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function cleanPriorities(raw: unknown): AiInsights['priorities'] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: Array<{ key: (typeof MATRICULATION_PRIORITIES)[number]; rank: number; evidence?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const key = pickEnum(record.key, MATRICULATION_PRIORITIES);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const rank = typeof record.rank === 'number' && Number.isFinite(record.rank) ? record.rank : Number.MAX_SAFE_INTEGER;
    const evidence = typeof record.evidence === 'string' ? maskPii(record.evidence.trim()).slice(0, 200) : '';
    items.push({ key, rank, ...(evidence ? { evidence } : {}) });
  }
  // Reordena pelo rank informado e renumera 1..n (ordem estável para empates).
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.rank - b.item.rank || a.index - b.index)
    .map(({ item }, index) => ({ ...item, rank: index + 1 }));
}

export type SynthesisResult = { summary: string; insights: Omit<AiInsights, 'summary' | 'model' | 'generatedAt'> };

/**
 * Saída da síntese (Anexo A.2). Em vez de reprovar a resposta inteira por um campo fora do enum,
 * descarta apenas o que for inválido — nada fora das listas permitidas chega ao banco.
 */
export const synthesisResponseSchema = z.record(z.unknown()).transform((raw, ctx): SynthesisResult => {
  const summary = typeof raw.summary === 'string' ? maskPii(raw.summary.trim()).slice(0, 1200) : '';
  if (!summary) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary'], message: 'summary ausente' });
    return z.NEVER;
  }

  const insights = aiInsightsSchema.omit({ summary: true, model: true, generatedAt: true }).safeParse({
    priorities: cleanPriorities(raw.priorities),
    goals: cleanStrings(raw.goals, 5),
    doubts: cleanStrings(raw.doubts, 8),
    objections: cleanStrings(raw.objections, 5),
    decisionStage: pickEnum(raw.decisionStage, DECISION_STAGES),
    influencers: pickEnums(raw.influencers, DECISION_INFLUENCERS),
    schoolMoment: pickEnum(raw.schoolMoment, SCHOOL_MOMENTS),
    decisionTimeline: pickEnum(raw.decisionTimeline, DECISION_TIMELINES),
    suggestedFocus: pickEnum(raw.suggestedFocus, VISIT_FOCUSES),
    talkingPoints: cleanStrings(raw.talkingPoints, 3),
  });
  if (!insights.success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'insights inválidos' });
    return z.NEVER;
  }

  return { summary, insights: insights.data };
});
