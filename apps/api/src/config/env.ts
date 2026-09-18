import { z } from 'zod';

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
