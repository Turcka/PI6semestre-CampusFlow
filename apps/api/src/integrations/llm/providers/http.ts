import { LlmError } from '../llm.types.js';

export type HttpResult = { status: number; ok: boolean; headers: Headers; text: string; json: unknown };

/** POST JSON com `fetch` nativo. Erros de rede sobem como exceção (tratados no cliente). */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): Promise<HttpResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, text, json };
}

/** `Retry-After` em segundos ou data HTTP -> milissegundos. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

/** Converte uma resposta HTTP de erro em LlmError tipado (429 e 5xx são repetíveis). */
export function httpError(res: HttpResult, providerCode?: string): LlmError {
  if (res.status === 429) {
    return new LlmError('rate_limited', 'Provedor LLM limitou as requisições (429).', {
      status: 429,
      providerCode,
      retryable: true,
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
    });
  }
  return new LlmError('provider', `Provedor LLM respondeu ${res.status}.`, {
    status: res.status,
    providerCode,
    retryable: res.status >= 500,
  });
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
