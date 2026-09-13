import type { Request } from 'express';
import type { z } from 'zod';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import { domainEvents } from '../../utils/events.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import type {
  cancelVisitSchema,
  createVisitSchema,
  generateSlotsSchema,
  listVisitsQuerySchema,
  publicSlotsQuerySchema,
  rescheduleVisitSchema,
} from './scheduling.schemas.js';

type GenerateSlots = z.infer<typeof generateSlotsSchema>;
type ListVisits = z.infer<typeof listVisitsQuerySchema>;
type CancelVisit = z.infer<typeof cancelVisitSchema>;
type RescheduleVisit = z.infer<typeof rescheduleVisitSchema>;
type CreateVisit = z.infer<typeof createVisitSchema>;
type PublicSlots = z.infer<typeof publicSlotsQuerySchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function generateSlots(req: Request, input: GenerateSlots) {
  const { user, supabase } = requireUser(req);
  const coordinatorId = user.role === 'coordenador' ? user.id : input.coordinatorId ?? null;

  const { data, error } = await supabase.rpc('generate_visit_slots', {
    p_tenant_id: user.tenantId,
    p_from: input.from,
    p_to: input.to,
    p_coordinator_id: coordinatorId,
  });
  if (error) mapRpcError(error);
  return { inserted: data as number };
}

export async function listVisits(req: Request, query: ListVisits) {
  const { user, supabase } = requireUser(req);
  const { page, pageSize, from, to } = parsePagination(query);

  let q = supabase
    .from('visits')
    .select('*, leads(full_name, email, phone), visit_slots(starts_at, ends_at)', { count: 'exact' })
    .eq('tenant_id', user.tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (user.role === 'coordenador') q = q.eq('coordinator_id', user.id);
  else if (query.coordinatorId) q = q.eq('coordinator_id', query.coordinatorId);

  if (query.status) q = q.eq('status', query.status);
  if (query.campusId) q = q.eq('campus_id', query.campusId);
  if (query.leadId) q = q.eq('lead_id', query.leadId);

  const { data, error, count } = await q;
  if (error) throw AppError.badRequest(error.message);
  return paginatedResponse(data ?? [], count ?? 0, page, pageSize);
}

export async function cancelVisit(req: Request, visitId: string, input: CancelVisit) {
  const { user, supabase } = requireUser(req);

  const { data: visit } = await supabase
    .from('visits')
    .select('id, coordinator_id, tenant_id')
    .eq('id', visitId)
    .eq('tenant_id', user.tenantId)
    .maybeSingle();
  if (!visit) throw AppError.notFound('Visita não encontrada.');
  if (user.role === 'coordenador' && visit.coordinator_id !== user.id) {
    throw AppError.forbidden();
  }

  const { data, error } = await supabase.rpc('cancel_visit', {
    p_visit_id: visitId,
    p_reason: input.reason ?? null,
  });
  if (error) mapRpcError(error);

  domainEvents.emit('visit.cancelled', {
    visitId,
    tenantId: user.tenantId,
    reason: input.reason,
  });

  return data;
}

export async function rescheduleVisit(req: Request, visitId: string, input: RescheduleVisit) {
  const { user, supabase } = requireUser(req);

  const { data: visit } = await supabase
    .from('visits')
    .select('*')
    .eq('id', visitId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (!visit) throw AppError.notFound('Visita não encontrada.');

  const { error: cancelError } = await supabase.rpc('cancel_visit', {
    p_visit_id: visitId,
    p_reason: input.reason ?? 'Reagendamento',
  });
  if (cancelError) mapRpcError(cancelError);

  const { data, error } = await supabase.rpc('book_visit', {
    p_slot_id: input.slotId,
    p_lead_id: visit.lead_id,
    p_type: visit.type,
    p_group_size: visit.group_size,
    p_group_name: visit.group_name,
    p_notes: visit.notes,
  });
  if (error) mapRpcError(error);
  return data;
}

export async function listPublicSlots(query: PublicSlots) {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc('available_slots', {
    p_campus_id: query.campusId,
    p_from: query.from,
    p_to: query.to,
    p_course_id: query.courseId ?? null,
  });
  if (error) mapRpcError(error);
  return data ?? [];
}

export async function createPublicVisit(input: CreateVisit) {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc('book_visit', {
    p_slot_id: input.slotId,
    p_lead_id: input.leadId,
    p_type: input.type,
    p_group_size: input.groupSize,
    p_notes: input.notes ?? null,
  });
  if (error) mapRpcError(error);
  return data;
}
