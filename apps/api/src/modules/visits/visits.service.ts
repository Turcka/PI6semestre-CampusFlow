import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import { domainEvents } from '../../utils/events.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import type {
  assignVisitSchema,
  cancelVisitSchema,
  createManualVisitSchema,
  createVisitNoteSchema,
  listVisitsQuerySchema,
  rescheduleVisitSchema,
  setVisitStatusSchema,
} from './visits.schemas.js';

type ListQuery = z.infer<typeof listVisitsQuerySchema>;
type SetStatus = z.infer<typeof setVisitStatusSchema>;
type NoteInput = z.infer<typeof createVisitNoteSchema>;
type ManualVisit = z.infer<typeof createManualVisitSchema>;
type Assign = z.infer<typeof assignVisitSchema>;
type Cancel = z.infer<typeof cancelVisitSchema>;
type Reschedule = z.infer<typeof rescheduleVisitSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listVisits(req: Request, query: ListQuery) {
  const { user, supabase } = requireUser(req);
  const { page, pageSize, from, to } = parsePagination(query);

  let q = supabase
    .from('visits')
    .select(
      '*, candidates(full_name, email, cpf, course_id), visit_invitations(id, status, role, expires_at)',
      { count: 'exact' },
    )
    .eq('tenant_id', user.tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (user.role === 'promotor') q = q.eq('promoter_id', user.id);
  else if (user.role === 'professor') q = q.eq('professor_id', user.id);
  else {
    if (query.promoterId) q = q.eq('promoter_id', query.promoterId);
    if (query.professorId) q = q.eq('professor_id', query.professorId);
  }

  if (query.status) q = q.eq('status', query.status);
  if (query.campusId) q = q.eq('campus_id', query.campusId);
  if (query.courseId) q = q.eq('course_id', query.courseId);
  if (query.candidateId) q = q.eq('candidate_id', query.candidateId);
  if (query.from) q = q.gte('created_at', query.from);
  if (query.to) q = q.lte('created_at', query.to);
  if (query.q) {
    q = q.or(
      `candidates.full_name.ilike.%${query.q}%,candidates.cpf.ilike.%${query.q}%,candidates.email.ilike.%${query.q}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw AppError.badRequest(error.message);

  const enriched = (data ?? []).map((visit) => {
    const invitations = (visit.visit_invitations as Array<{ status: string }> | null) ?? [];
    const pendingIssues: string[] = [];
    if (!visit.promoter_id) pendingIssues.push('sem_promotor');
    if (visit.status === 'aguardando_professor') pendingIssues.push('aguardando_professor');
    if (invitations.some((i) => i.status === 'pending')) pendingIssues.push('convite_pendente');
    return { ...visit, pendingIssues };
  });

  return paginatedResponse(enriched, count ?? 0, page, pageSize);
}

export async function getVisit(req: Request, visitId: string) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('visits')
    .select(
      `*,
      candidates(*, candidate_interests(*, interest_categories(*))),
      visit_invitations(*),
      visit_reassignments(*),
      visit_status_history(*),
      visit_notes(*),
      visit_itinerary_items(*, pois(*)),
      match_runs(*, match_results(*)),
      message_logs(id, channel, status, sent_at)`,
    )
    .eq('id', visitId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !data) throw AppError.notFound('Visita não encontrada.');
  if (user.role === 'promotor' && data.promoter_id !== user.id) throw AppError.forbidden();
  if (user.role === 'professor' && data.professor_id !== user.id) throw AppError.forbidden();
  return data;
}

export async function setVisitStatus(req: Request, visitId: string, input: SetStatus) {
  const { user, supabase } = requireUser(req);
  await getVisit(req, visitId);

  const { data, error } = await supabase.rpc('set_visit_status', {
    p_visit_id: visitId,
    p_status: input.status,
    p_actor: user.id,
    p_reason: input.reason ?? null,
  });
  if (error) mapRpcError(error);
  return data;
}

export async function addNote(req: Request, visitId: string, input: NoteInput) {
  const { user, supabase } = requireUser(req);
  await getVisit(req, visitId);
  const { data, error } = await supabase
    .from('visit_notes')
    .insert({
      visit_id: visitId,
      author_id: user.id,
      body: input.body,
      phase: input.phase,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function listNotes(req: Request, visitId: string) {
  const { supabase } = requireUser(req);
  await getVisit(req, visitId);
  const { data, error } = await supabase
    .from('visit_notes')
    .select('*')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: false });
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function getBriefing(req: Request, visitId: string) {
  const visit = await getVisit(req, visitId);
  const candidate = visit.candidates as {
    full_name?: string;
    preferred_focus?: string | null;
    profile_summary?: string | null;
    behavioral_profile?: unknown;
    candidate_interests?: unknown;
  } | null;

  return {
    visitId: visit.id,
    status: visit.status,
    focus: visit.focus,
    candidate: candidate
      ? {
          firstName: (candidate.full_name ?? '').split(/\s+/)[0],
          preferredFocus: candidate.preferred_focus,
          profileSummary: candidate.profile_summary,
          behavioralProfile: candidate.behavioral_profile,
          interests: candidate.candidate_interests,
        }
      : null,
    itinerary: visit.visit_itinerary_items ?? [],
    professorId: visit.professor_id,
    match: visit.match_runs ?? null,
  };
}

export async function createManualVisit(req: Request, input: ManualVisit) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.rpc('schedule_visit_with_match', {
    p_candidate_id: input.candidateId,
    p_window: `[${input.windowStart},${input.windowEnd})`,
    p_requested_by: user.id,
    p_prefer_promoter_id: input.promoterId ?? null,
  });
  if (error) mapRpcError(error);
  return data;
}

export async function assignVisit(req: Request, visitId: string, input: Assign) {
  const { user, supabase } = requireUser(req);
  const { data: promoterAssign, error: promoterError } = await supabase.rpc('assign_visit_manually', {
    p_visit_id: visitId,
    p_role: 'promotor',
    p_profile_id: input.promoterId,
    p_actor: user.id,
  });
  if (promoterError) mapRpcError(promoterError);

  if (input.professorId) {
    const { data, error } = await supabase.rpc('assign_visit_manually', {
      p_visit_id: visitId,
      p_role: 'professor',
      p_profile_id: input.professorId,
      p_actor: user.id,
    });
    if (error) mapRpcError(error);
    return data;
  }

  return promoterAssign;
}

export async function cancelVisit(req: Request, visitId: string, input: Cancel) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.rpc('cancel_visit', {
    p_visit_id: visitId,
    p_actor: user.id,
    p_reason: input.reason ?? null,
    p_override: input.override ?? false,
  });
  if (error) mapRpcError(error);
  domainEvents.emit('visit.cancelled', { visitId, tenantId: user.tenantId, reason: input.reason });
  return data;
}

export async function rescheduleVisit(req: Request, visitId: string, input: Reschedule) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.rpc('reschedule_visit', {
    p_visit_id: visitId,
    p_new_window: `[${input.windowStart},${input.windowEnd})`,
    p_actor: user.id,
    p_override: input.override ?? false,
  });
  if (error) mapRpcError(error);
  return data;
}
