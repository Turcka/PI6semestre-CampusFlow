import type { Request } from 'express';
import type { z } from 'zod';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { domainEvents } from '../../utils/events.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import type {
  cancelVisitSchema,
  generateSlotsSchema,
  listVisitsQuerySchema,
  publicScheduleVisitSchema,
  publicWindowsQuerySchema,
  rescheduleVisitSchema,
  schedulingPolicySchema,
} from './scheduling.schemas.js';

type GenerateSlots = z.infer<typeof generateSlotsSchema>;
type ListVisits = z.infer<typeof listVisitsQuerySchema>;
type CancelVisit = z.infer<typeof cancelVisitSchema>;
type RescheduleVisit = z.infer<typeof rescheduleVisitSchema>;
type PublicWindows = z.infer<typeof publicWindowsQuerySchema>;
type PublicSchedule = z.infer<typeof publicScheduleVisitSchema>;
type PolicyInput = z.infer<typeof schedulingPolicySchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

async function assertCandidateAccess(candidateId: string, portalToken?: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('candidates')
    .select('id, portal_token, tenant_id, course_id, campus_id, profile_completed_at')
    .eq('id', candidateId)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Candidato não encontrado.');
  if (portalToken && data.portal_token !== portalToken) throw AppError.forbidden('Token do candidato inválido.');
  return data;
}

export async function generateSlots(req: Request, input: GenerateSlots) {
  const { user, supabase } = requireUser(req);
  const ownerId = user.role === 'promotor' || user.role === 'professor' ? user.id : input.ownerId ?? null;

  const { data, error } = await supabase.rpc('generate_visit_slots', {
    p_tenant_id: user.tenantId,
    p_from: input.from,
    p_to: input.to,
    p_owner_id: ownerId,
  });
  if (error) mapRpcError(error);
  return { inserted: data as number };
}

export async function listVisits(req: Request, query: ListVisits) {
  const { user, supabase } = requireUser(req);
  const { page, pageSize, from, to } = parsePagination(query);

  let q = supabase
    .from('visits')
    .select('*, candidates(full_name, email, phone), visit_slots(starts_at, ends_at)', { count: 'exact' })
    .eq('tenant_id', user.tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (user.role === 'promotor') q = q.eq('promoter_id', user.id);
  else if (user.role === 'professor') q = q.eq('professor_id', user.id);
  else if (query.promoterId) q = q.eq('promoter_id', query.promoterId);

  if (query.status) q = q.eq('status', query.status);
  if (query.campusId) q = q.eq('campus_id', query.campusId);
  if (query.candidateId) q = q.eq('candidate_id', query.candidateId);

  const { data, error, count } = await q;
  if (error) throw AppError.badRequest(error.message);
  return paginatedResponse(data ?? [], count ?? 0, page, pageSize);
}

export async function cancelVisit(req: Request, visitId: string, input: CancelVisit) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.rpc('cancel_visit', {
    p_visit_id: visitId,
    p_actor: user.id,
    p_reason: input.reason ?? null,
    p_override: true,
  });
  if (error) mapRpcError(error);
  domainEvents.emit('visit.cancelled', { visitId, tenantId: user.tenantId, reason: input.reason });
  return data;
}

export async function rescheduleVisit(req: Request, visitId: string, input: RescheduleVisit) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase.rpc('reschedule_visit', {
    p_visit_id: visitId,
    p_new_window: `[${input.windowStart},${input.windowEnd})`,
    p_actor: user.id,
    p_override: true,
  });
  if (error) mapRpcError(error);
  return data;
}

export async function listPublicWindows(query: PublicWindows) {
  const candidate = await assertCandidateAccess(query.candidateId, query.portalToken);
  const admin = getAdminClient();

  const { data: slots, error } = await admin
    .from('visit_slots')
    .select('id, owner_id, campus_id, starts_at, ends_at, capacity, booked_count, owner_role')
    .eq('is_open', true)
    .eq('owner_role', 'promotor')
    .gte('starts_at', query.from)
    .lte('starts_at', query.to)
    .order('starts_at');
  if (error) throw AppError.badRequest(error.message);

  const openSlots = (slots ?? []).filter((s) => s.booked_count < s.capacity);
  const byDay = new Map<string, typeof openSlots>();
  for (const slot of openSlots) {
    const day = slot.starts_at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(slot);
    byDay.set(day, list);
  }

  return {
    candidateId: candidate.id,
    campusId: candidate.campus_id,
    courseId: candidate.course_id,
    profileCompleted: Boolean(candidate.profile_completed_at),
    days: [...byDay.entries()].map(([date, windows]) => ({
      date,
      windows: windows.map((w) => ({
        startsAt: w.starts_at,
        endsAt: w.ends_at,
        capacity: w.capacity,
        bookedCount: w.booked_count,
      })),
    })),
  };
}

export async function createPublicVisit(input: PublicSchedule) {
  await assertCandidateAccess(input.candidateId, input.portalToken);
  const admin = getAdminClient();
  const { data, error } = await admin.rpc('schedule_visit_with_match', {
    p_candidate_id: input.candidateId,
    p_window: `[${input.windowStart},${input.windowEnd})`,
    p_requested_by: null,
    p_prefer_promoter_id: null,
  });
  if (error) mapRpcError(error);

  const visit = data as {
    id: string;
    status: string;
    period: string;
    professor_id: string | null;
    professor_requirement?: string | null;
  };

  return {
    visitId: visit.id,
    status: visit.status,
    period: visit.period,
    professorRequested: Boolean(visit.professor_id) || visit.professor_requirement === 'required',
  };
}

export async function getPublicVisit(visitId: string, portalToken?: string) {
  const admin = getAdminClient();
  const { data: visit, error } = await admin
    .from('visits')
    .select(
      'id, status, period, campus_id, course_id, promoter_id, professor_id, focus, candidates(full_name, portal_token), campuses(name, address), profiles!visits_promoter_id_fkey(full_name)',
    )
    .eq('id', visitId)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!visit) throw AppError.notFound('Visita não encontrada.');

  const candidate = visit.candidates as { full_name?: string; portal_token?: string } | null;
  if (portalToken && candidate?.portal_token !== portalToken) throw AppError.forbidden();

  const promoter = visit.profiles as { full_name?: string } | null;
  const firstName = (promoter?.full_name ?? '').split(/\s+/)[0] || null;
  const campus = visit.campuses as { name?: string; address?: string } | null;

  return {
    id: visit.id,
    status: visit.status,
    period: visit.period,
    focus: visit.focus,
    campus,
    promoterFirstName: firstName,
    hasProfessor: Boolean(visit.professor_id),
  };
}

export async function cancelPublicVisit(visitId: string, input: CancelVisit) {
  const admin = getAdminClient();
  const { data: visit } = await admin
    .from('visits')
    .select('id, candidates(portal_token)')
    .eq('id', visitId)
    .maybeSingle();
  if (!visit) throw AppError.notFound('Visita não encontrada.');
  const candidate = visit.candidates as { portal_token?: string } | null;
  if (input.portalToken && candidate?.portal_token !== input.portalToken) throw AppError.forbidden();

  const { data, error } = await admin.rpc('cancel_visit', {
    p_visit_id: visitId,
    p_actor: null,
    p_reason: input.reason ?? null,
    p_override: false,
  });
  if (error) mapRpcError(error);
  return data;
}

export async function reschedulePublicVisit(visitId: string, input: RescheduleVisit) {
  const admin = getAdminClient();
  const { data: visit } = await admin
    .from('visits')
    .select('id, candidates(portal_token)')
    .eq('id', visitId)
    .maybeSingle();
  if (!visit) throw AppError.notFound('Visita não encontrada.');
  const candidate = visit.candidates as { portal_token?: string } | null;
  if (input.portalToken && candidate?.portal_token !== input.portalToken) throw AppError.forbidden();

  const { data, error } = await admin.rpc('reschedule_visit', {
    p_visit_id: visitId,
    p_new_window: `[${input.windowStart},${input.windowEnd})`,
    p_actor: null,
    p_override: false,
  });
  if (error) mapRpcError(error);
  return data;
}

export async function getPolicies(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('scheduling_policies')
    .select('*')
    .eq('tenant_id', user.tenantId)
    .order('focus');
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function putPolicy(req: Request, input: PolicyInput) {
  const { user, supabase } = requireUser(req);
  const row = {
    tenant_id: user.tenantId,
    focus: input.focus ?? null,
    min_hours_to_cancel: input.minHoursToCancel,
    min_hours_to_reschedule: input.minHoursToReschedule,
    invitation_timeout_minutes: input.invitationTimeoutMinutes,
    max_reassignments: input.maxReassignments,
    default_duration_minutes: input.defaultDurationMinutes,
  };
  const { data, error } = await supabase.from('scheduling_policies').upsert(row).select().single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}
