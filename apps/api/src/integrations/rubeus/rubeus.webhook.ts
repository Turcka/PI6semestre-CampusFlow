import type { Request, Response } from 'express';

import { env } from '../../config/env.js';
import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const handleRubeusWebhook = asyncHandler(async (req: Request, res: Response) => {
  const secret = req.header('x-rubeus-secret') ?? req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (env.RUBEUS_WEBHOOK_SECRET && secret !== env.RUBEUS_WEBHOOK_SECRET) {
    throw AppError.unauthorized('Assinatura Rubeus inválida.');
  }

  const body = req.body as {
    trackingCode?: string;
    rubeusContactId?: string;
    eventType?: string;
    type?: string;
    occurredAt?: string;
    payload?: Record<string, unknown>;
  };

  const trackingCode = body.trackingCode;
  const eventType = body.eventType ?? body.type ?? 'status_update';
  if (!trackingCode) throw AppError.badRequest('trackingCode é obrigatório.');

  const admin = getAdminClient();
  const { data: candidate, error } = await admin
    .from('candidates')
    .select('id, tenant_id, status')
    .eq('tracking_code', trackingCode)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!candidate) throw AppError.notFound('Candidato não encontrado para o trackingCode.');

  const mappedType =
    eventType === 'enrolled' || eventType === 'matriculado'
      ? 'enrolled'
      : eventType === 'lost'
        ? 'lost'
        : 'lead_updated';

  await admin.from('conversion_events').insert({
    tenant_id: candidate.tenant_id,
    candidate_id: candidate.id,
    type: mappedType,
    source: 'rubeus',
    occurred_at: body.occurredAt ?? new Date().toISOString(),
    raw: body.payload ?? body,
  });

  if (mappedType === 'enrolled') {
    await admin
      .from('candidates')
      .update({ status: 'matriculado', enrolled_at: new Date().toISOString() })
      .eq('id', candidate.id);
  }

  if (body.rubeusContactId) {
    await admin.from('rubeus_links').upsert({
      candidate_id: candidate.id,
      tenant_id: candidate.tenant_id,
      tracking_code: trackingCode,
      rubeus_contact_id: body.rubeusContactId,
      last_status: eventType,
      last_pull_at: new Date().toISOString(),
    });
  }

  res.status(202).json({ ok: true });
});
