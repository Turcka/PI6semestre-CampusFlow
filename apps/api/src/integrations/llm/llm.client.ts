import type { z } from 'zod';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  LlmError,
  type LlmMessage,
  type LlmProvider,
  type LlmStructuredRequest,
  type LlmStructuredResponse,
  type ProviderRequest,
} from './llm.types.js';
import { anthropicProvider } from './providers/anthropic.js';
import { geminiProvider } from './providers/gemini.js';
import { openaiCompatibleProvider, openaiProvider } from './providers/openai.js';

export { LlmError } from './llm.types.js';
export type { LlmErrorKind, LlmMessage, LlmStructuredRequest, LlmStructuredResponse } from './llm.types.js';

const PROVIDERS: Record<typeof env.LLM_PROVIDER, LlmProvider> = {
  openai: openaiProvider,
  openai_compatible: openaiCompatibleProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

/** Espera máxima antes da segunda tentativa; acima disso não vale segurar a requisição do visitante. */
const MAX_RETRY_WAIT_MS = 2000;
const DEFAULT_RETRY_WAIT_MS = 400;
const CONVERSATION_START = '(início da conversa)';

/** Mesmo padrão de WHATSAPP_ENABLED: precisa do flag e da credencial. */
export function isLlmEnabled(): boolean {
  return env.LLM_ENABLED && Boolean(env.LLM_API_KEY);
}

/**
 * Separa as mensagens `system`, funde mensagens consecutivas do mesmo papel e garante que a
 * conversa comece por `user` (exigência de alguns provedores).
 */
export function normalizeConversation(messages: LlmMessage[]): Pick<ProviderRequest, 'system' | 'messages'> {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');

  const turns: ProviderRequest['messages'] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    const last = turns[turns.length - 1];
    if (last && last.role === message.role) last.content = `${last.content}\n${message.content}`;
    else turns.push({ role: message.role, content: message.content });
  }
  if (turns[0]?.role !== 'user') turns.unshift({ role: 'user', content: CONVERSATION_START });

  return { system, messages: turns };
}

/** Primeiro bloco `{...}` balanceado do texto (ignora chaves dentro de strings). */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** JSON.parse tolerante: aceita o JSON puro ou embrulhado em texto/cercas de código. */
export function parseJsonOutput(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const block = firstJsonObject(trimmed);
    if (block) {
      try {
        return JSON.parse(block);
      } catch {
        // cai no erro abaixo
      }
    }
  }
  throw new LlmError('invalid_output', 'A LLM não devolveu um JSON válido.');
}

function parseStructured<T>(raw: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const parsed = schema.safeParse(parseJsonOutput(raw));
  if (!parsed.success) throw new LlmError('invalid_output', 'A resposta da LLM não segue o formato esperado.');
  return parsed.data;
}

function toLlmError(err: unknown, aborted: boolean): LlmError {
  if (err instanceof LlmError) return err;
  if (aborted || (err instanceof Error && err.name === 'AbortError')) {
    return new LlmError('timeout', 'Tempo limite da LLM excedido.');
  }
  // fetch rejeita com TypeError em falha de rede/DNS/conexão recusada.
  return new LlmError('provider', 'Falha de rede ao chamar o provedor LLM.', { retryable: true });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chama o provedor configurado e devolve a saída já validada pelo `schema`.
 * - Prazo total de LLM_TIMEOUT_MS (somando a segunda tentativa).
 * - Uma nova tentativa em erro de rede, 5xx ou 429 (respeitando Retry-After curto).
 * - Nunca loga o conteúdo das mensagens: só modelo, tokens, latência e tipo do erro.
 */
export async function generateStructured<T>(req: LlmStructuredRequest<T>): Promise<LlmStructuredResponse<T>> {
  if (!isLlmEnabled() || !env.LLM_API_KEY) throw new LlmError('disabled', 'LLM desativada.');

  const provider = PROVIDERS[env.LLM_PROVIDER];
  const conversation = normalizeConversation(req.messages);
  const startedAt = Date.now();
  const deadline = startedAt + env.LLM_TIMEOUT_MS;

  for (let attempt = 1; ; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new LlmError('timeout', 'Tempo limite da LLM excedido.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const result = await provider({
        ...conversation,
        jsonSchema: req.jsonSchema,
        maxOutputTokens: req.maxOutputTokens ?? env.LLM_MAX_OUTPUT_TOKENS,
        temperature: req.temperature ?? 0.3,
        model: env.LLM_MODEL,
        apiKey: env.LLM_API_KEY,
        baseUrl: env.LLM_BASE_URL,
        signal: controller.signal,
      });
      const data = parseStructured(result.raw, req.schema);
      const latencyMs = Date.now() - startedAt;
      logger.debug(
        { provider: env.LLM_PROVIDER, model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs, attempt },
        'LLM respondeu',
      );
      return { data, raw: result.raw, model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs };
    } catch (err) {
      const error = toLlmError(err, controller.signal.aborted);
      const wait = error.options.retryAfterMs ?? DEFAULT_RETRY_WAIT_MS;
      const canRetry = error.retryable && attempt < 2 && wait <= MAX_RETRY_WAIT_MS && Date.now() + wait < deadline;

      logger.warn(
        {
          provider: env.LLM_PROVIDER,
          model: env.LLM_MODEL,
          kind: error.kind,
          status: error.options.status,
          providerCode: error.options.providerCode,
          attempt,
          willRetry: canRetry,
          latencyMs: Date.now() - startedAt,
        },
        'LLM falhou',
      );

      if (!canRetry) throw error;
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }
}
