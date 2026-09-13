import type { UserRole } from '@campusflow/shared';
import type { NextFunction, Request, Response } from 'express';

import { getAdminClient } from '../config/supabase.js';
import { AppError } from '../utils/app-error.js';

/**
 * Verifica limites do plano SaaS do tenant antes de ações que consomem cotas
 * (novo coordenador, confirmação de importação de leads).
 */
export function enforcePlanLimits(kind: 'coordinator' | 'leads', amount = 1) {
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

      if (kind === 'coordinator' && plan.max_coordinators != null) {
        const { count } = await admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('role', 'coordenador' satisfies UserRole)
          .eq('is_active', true);
        if ((count ?? 0) + amount > plan.max_coordinators) {
          throw AppError.forbidden(`Limite de coordenadores do plano atingido (${plan.max_coordinators}).`);
        }
      }

      if (kind === 'leads' && plan.max_leads_month != null) {
        const start = new Date();
        start.setUTCDate(1);
        start.setUTCHours(0, 0, 0, 0);
        const { count } = await admin
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', start.toISOString());
        if ((count ?? 0) + amount > plan.max_leads_month) {
          throw AppError.forbidden(`Limite mensal de leads do plano atingido (${plan.max_leads_month}).`);
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
