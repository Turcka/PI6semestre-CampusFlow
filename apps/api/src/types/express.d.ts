import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuthUser } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      supabase?: SupabaseClient;
      requestId?: string;
      /** Token do portal do candidato (header `X-Candidate-Token`), em rotas públicas do chatbot. */
      candidateToken?: string;
    }
  }
}

export {};
