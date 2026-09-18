/** @deprecated Legacy ERP webhook — prefer Rubeus. Mantido para compatibilidade. */
import type { Request, Response } from 'express';

import { getAdminClient } from '../../config/supabase.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/app-error.js';

export const handleErpWebhook = asyncHandler(async (req: Request, res: Response) => {
  const tenantSlug = req.params.tenantSlug;
  if (!tenantSlug) throw AppError.badRequest('tenantSlug obrigatório.');

  const admin = getAdminClient();
  const { data: tenant, error } = await admin.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!tenant) throw AppError.notFound('Tenant não encontrado.');

  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : null;
  const candidateId =
    typeof req.body?.candidateId === 'string'
      ? req.body.candidateId
      : typeof req.body?.leadId === 'string'
        ? req.body.leadId
        : null;

  let query = admin
    .from('candidates')
    .update({ status: 'matriculado', enrolled_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id);
  if (candidateId) query = query.eq('id', candidateId);
  else if (email) query = query.eq('email', email);
  else throw AppError.badRequest('Informe candidateId ou email.');

  const { data, error: updateError } = await query.select('id, status').maybeSingle();
  if (updateError) throw AppError.badRequest(updateError.message);
  if (!data) throw AppError.notFound('Candidato não encontrado.');

  res.json({ ok: true, candidate: data });
});
