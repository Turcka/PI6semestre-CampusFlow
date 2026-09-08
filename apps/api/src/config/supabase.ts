import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from './env.js';

let adminClient: SupabaseClient | null = null;

/**
 * Cliente Supabase com SERVICE ROLE (ignora RLS).
 * Usar apenas em operações internas do servidor (workers, importações, billing).
 * Para requisições de usuários, preferir `createUserClient(jwt)` que respeita RLS.
 */
export function getAdminClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  }
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/**
 * Cliente Supabase autenticado com o JWT do usuário da requisição.
 * As políticas RLS (por tenant e role) são aplicadas automaticamente.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
