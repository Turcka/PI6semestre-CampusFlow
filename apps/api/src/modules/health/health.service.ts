import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';

export async function checkLiveness() {
  return {
    status: 'ok' as const,
    service: 'campusflow-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}

/** Verifica conectividade com o Supabase (select 1). */
export async function checkReadiness() {
  const admin = getAdminClient();
  const { error } = await admin.from('tenants').select('id').limit(1);
  if (error) {
    throw new AppError(503, 'NOT_READY', 'Supabase indisponível.', error.message);
  }
  return {
    status: 'ready' as const,
    service: 'campusflow-api',
    timestamp: new Date().toISOString(),
  };
}
