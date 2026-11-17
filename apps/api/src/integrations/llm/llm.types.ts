import type { z } from 'zod';

export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmStructuredRequest<T> = {
  messages: LlmMessage[];
  /** Validação final no servidor. */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** Enviado ao provedor (response_format / tool) quando ele suporta. */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  /** 0.3 nos turnos, 0.2 na síntese. */
  temperature?: number;
};

export type LlmStructuredResponse<T> = {
  data: T;
  raw: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

export type LlmErrorKind = 'timeout' | 'rate_limited' | 'invalid_output' | 'provider' | 'disabled';

export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly options: {
      status?: number;
      /** Código curto devolvido pelo provedor (ex.: `invalid_api_key`). Nunca o texto das mensagens. */
      providerCode?: string;
      retryable?: boolean;
      retryAfterMs?: number;
    } = {},
  ) {
    super(message);
    this.name = 'LlmError';
  }

  get retryable() {
    return this.options.retryable ?? false;
  }
}

/** Pedido já normalizado que o cliente entrega a um adaptador de provedor. */
export type ProviderRequest = {
  system: string;
  /** Sem mensagens `system`, papéis alternados e sempre começando por `user`. */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  temperature: number;
  model: string;
  apiKey: string;
  baseUrl?: string;
  signal: AbortSignal;
};

export type ProviderResult = {
  /** Texto bruto devolvido pelo modelo (esperado: um JSON). */
  raw: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
};

export type LlmProvider = (req: ProviderRequest) => Promise<ProviderResult>;
