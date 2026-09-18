import type { NextFunction, Request, Response } from 'express';

import { getAdminClient } from '../config/supabase.js';
import { AppError } from '../utils/app-error.js';

/**
 * @deprecated Billing/plan limits saíram do núcleo (módulo em `_legacy/billing`).
 * Mantido apenas para imports legados; não montar em rotas novas.
 */
export function enforcePlanLimits(kind: 'promoter' | 'candidates' | 'coordinator' | 'leads', amount = 1) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized();
      const admin = getAdminClient();
      const tenantId = req.user.tenantId;

      const { data: sub } = await admin
        .from('tenant_subscriptions')
        .select('plan_id, plans(max_leads_month, max_coordinators)')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const plan = (sub as { plans?: { max_leads_month: number | null; max_coordinators: number | null } } | null)
        ?.plans;
      if (!plan) {
        next();
        return;
      }

      if ((kind === 'promoter' || kind === 'coordinator') && plan.max_coordinators != null) {
        const { count } = await admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('role', 'promotor')
          .eq('is_active', true);
        if ((count ?? 0) + amount > plan.max_coordinators) {
          throw AppError.forbidden(`Limite de promotores do plano atingido (${plan.max_coordinators}).`);
        }
      }

      if ((kind === 'candidates' || kind === 'leads') && plan.max_leads_month != null) {
        const start = new Date();
        start.setUTCDate(1);
        start.setUTCHours(0, 0, 0, 0);
        const { count } = await admin
          .from('candidates')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', start.toISOString());
        if ((count ?? 0) + amount > plan.max_leads_month) {
          throw AppError.forbidden(`Limite mensal de candidatos do plano atingido (${plan.max_leads_month}).`);
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
