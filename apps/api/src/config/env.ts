import { z } from 'zod';

/** `LLM_BASE_URL=` (vazio no .env) deve valer como "não definido", não como URL inválida. */
const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/**
 * Validação das variáveis de ambiente com zod.
 * Falha rápido na inicialização se algo obrigatório estiver ausente.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim())),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  WHATSAPP_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  WHATSAPP_API_VERSION: z.string().default('v20.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_FROM_NAME: z.string().optional(),
  SENDGRID_WEBHOOK_PUBLIC_KEY: z.string().optional(),

  RUBEUS_BASE_URL: z.string().url().optional(),
  RUBEUS_API_TOKEN: z.string().optional(),
  RUBEUS_ORIGIN_ID: z.string().optional(),
  RUBEUS_WEBHOOK_SECRET: z.string().optional(),

  QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  QUEUE_VISIBILITY_TIMEOUT_S: z.coerce.number().int().positive().default(60),
  QUEUE_MAX_RETRIES: z.coerce.number().int().positive().default(5),

  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  // Secretário virtual (LLM). Só liga com LLM_ENABLED=true e LLM_API_KEY definidos.
  LLM_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  LLM_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['openai', 'anthropic', 'gemini', 'openai_compatible']).default('openai'),
  ),
  LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  LLM_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().default('gpt-4o-mini')),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  LLM_MAX_TURNS: z.coerce.number().int().positive().default(16),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(400),
  LLM_SESSION_TOKEN_BUDGET: z.coerce.number().int().positive().default(40000),

  ALLOW_PORTAL_EMAIL_LOOKUP: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
  API_BASE_URL: z.string().url().default('http://localhost:3333'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
