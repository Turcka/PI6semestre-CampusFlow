import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import type { markEnrolledSchema } from './conversion.schemas.js';

type MarkEnrolled = z.infer<typeof markEnrolledSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function getCandidateConversion(req: Request, candidateId: string) {
  const { user, supabase } = requireUser(req);
  const [{ data: candidate }, { data: events }, { data: link }] = await Promise.all([
    supabase
      .from('candidates')
      .select('id, full_name, status, tracking_code, enrolled_at')
      .eq('id', candidateId)
      .eq('tenant_id', user.tenantId)
      .single(),
    supabase
      .from('conversion_events')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('occurred_at', { ascending: false }),
    supabase.from('rubeus_links').select('*').eq('candidate_id', candidateId).maybeSingle(),
  ]);

  if (!candidate) throw AppError.notFound('Candidato não encontrado.');
  return { candidate, events: events ?? [], rubeus: link };
}

export async function markEnrolled(req: Request, candidateId: string, input: MarkEnrolled) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('candidates')
    .update({ status: 'matriculado', enrolled_at: new Date().toISOString() })
    .eq('id', candidateId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Candidato não encontrado.');

  await supabase.from('conversion_events').insert({
    tenant_id: user.tenantId,
    candidate_id: candidateId,
    source: 'manual',
    type: 'enrolled',
    raw: { reason: input.reason ?? null, actor_id: user.id },
    occurred_at: new Date().toISOString(),
  });

  await supabase.from('audit_logs').insert({
    tenant_id: user.tenantId,
    actor_id: user.id,
    action: 'conversion.mark_enrolled',
    entity: 'candidates',
    entity_id: candidateId,
    diff: { reason: input.reason ?? null },
  });

  return data;
}
