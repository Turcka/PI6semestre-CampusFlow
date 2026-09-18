import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import { domainEvents } from '../../utils/events.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import type { declineInvitationSchema, listInvitationsQuerySchema } from './invitations.schemas.js';

type ListQuery = z.infer<typeof listInvitationsQuerySchema>;
type Decline = z.infer<typeof declineInvitationSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listMyInvitations(req: Request, query: ListQuery) {
  const { user, supabase } = requireUser(req);

  let q = supabase
    .from('visit_invitations')
    .select(
      'id, visit_id, role, status, expires_at, sent_at, visits(id, status, focus, period, campus_id, course_id, candidates(full_name, preferred_focus, profile_summary))',
    )
    .eq('profile_id', user.id)
    .order('sent_at', { ascending: false });

  if (query.status) q = q.eq('status', query.status);

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);

  return (data ?? []).map((inv) => {
    const visit = inv.visits as {
      candidates?: { full_name?: string; preferred_focus?: string | null; profile_summary?: string | null } | null;
    } | null;
    const fullName = visit?.candidates?.full_name ?? '';
    const firstName = fullName.split(/\s+/)[0] ?? '';
    return {
      ...inv,
      visits: visit
        ? {
            ...visit,
            candidates: visit.candidates
              ? {
                  firstName,
                  preferred_focus: visit.candidates.preferred_focus,
                  profile_summary: visit.candidates.profile_summary,
                }
              : null,
          }
        : null,
    };
  });
}

export async function acceptInvitation(req: Request, invitationId: string) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.rpc('respond_invitation', {
    p_invitation_id: invitationId,
    p_accept: true,
    p_reason: null,
    p_actor_id: user.id,
  });
  if (error) mapRpcError(error);
  return data;
}

export async function declineInvitation(req: Request, invitationId: string, input: Decline) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.rpc('respond_invitation', {
    p_invitation_id: invitationId,
    p_accept: false,
    p_reason: input.reason ?? null,
    p_actor_id: user.id,
  });
  if (error) mapRpcError(error);

  domainEvents.emit('visit.reassigned', {
    visitId: (data as { id?: string } | null)?.id ?? invitationId,
    tenantId: user.tenantId,
    reason: input.reason,
  });

  return data;
}
