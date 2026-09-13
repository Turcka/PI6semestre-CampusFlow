import type { Request, Response } from 'express';

import { getAdminClient } from '../../config/supabase.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/app-error.js';

/** Recebe matrícula efetivada do ERP e marca lead como matriculado. */
export const handleErpWebhook = asyncHandler(async (req: Request, res: Response) => {
  const tenantSlug = req.params.tenantSlug;
  if (!tenantSlug) throw AppError.badRequest('tenantSlug obrigatório.');

  const admin = getAdminClient();
  const { data: tenant, error } = await admin.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!tenant) throw AppError.notFound('Tenant não encontrado.');

  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : null;
  const leadId = typeof req.body?.leadId === 'string' ? req.body.leadId : null;

  let query = admin.from('leads').update({ status: 'matriculado', enrolled_at: new Date().toISOString() }).eq('tenant_id', tenant.id);
  if (leadId) query = query.eq('id', leadId);
  else if (email) query = query.eq('email', email);
  else throw AppError.badRequest('Informe leadId ou email.');

  const { data, error: updateError } = await query.select('id, status').maybeSingle();
  if (updateError) throw AppError.badRequest(updateError.message);
  if (!data) throw AppError.notFound('Lead não encontrado.');

  res.json({ ok: true, lead: data });
});
