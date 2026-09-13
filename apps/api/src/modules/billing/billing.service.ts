import type { Request } from 'express';

import { AppError } from '../../utils/app-error.js';

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function getUsage(req: Request) {
  const { user, supabase } = requireUser(req);
  const period = new Date();
  period.setUTCDate(1);
  const periodKey = period.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('usage_metrics')
    .select('*')
    .eq('tenant_id', user.tenantId)
    .eq('period', periodKey)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);

  if (data) return data;

  // fallback live counts
  const start = periodKey;
  const [{ count: leads }, { count: coordinators }, { count: campuses }] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .gte('created_at', `${start}T00:00:00Z`),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .eq('role', 'coordenador')
      .eq('is_active', true),
    supabase
      .from('campuses')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .eq('is_active', true),
  ]);

  return {
    period: periodKey,
    leads_processed: leads ?? 0,
    active_coordinators: coordinators ?? 0,
    active_campuses: campuses ?? 0,
    whatsapp_sent: 0,
    emails_sent: 0,
    visits_booked: 0,
    visits_completed: 0,
    live: true,
  };
}

export async function getPlan(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select('*, plans(*)')
    .eq('tenant_id', user.tenantId)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  return data;
}
