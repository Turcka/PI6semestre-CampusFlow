import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import type {
  createExceptionSchema,
  listExceptionsQuerySchema,
  listRulesQuerySchema,
  putRulesSchema,
} from './availability.schemas.js';

type ListRulesQuery = z.infer<typeof listRulesQuerySchema>;
type PutRules = z.infer<typeof putRulesSchema>;
type CreateException = z.infer<typeof createExceptionSchema>;
type ListExceptionsQuery = z.infer<typeof listExceptionsQuerySchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

function resolveCoordinatorId(req: Request, requested?: string) {
  const { user } = requireUser(req);
  if (user.role === 'coordenador') {
    if (requested && requested !== user.id) {
      throw AppError.forbidden('Coordenador só pode gerenciar a própria agenda.');
    }
    return user.id;
  }
  if (!requested) throw AppError.badRequest('coordinatorId é obrigatório.');
  return requested;
}

export async function listRules(req: Request, query: ListRulesQuery) {
  const { user, supabase } = requireUser(req);
  const coordinatorId =
    user.role === 'coordenador' ? user.id : query.coordinatorId ?? null;

  let q = supabase.from('availability_rules').select('*').eq('tenant_id', user.tenantId).order('weekday');
  if (coordinatorId) q = q.eq('coordinator_id', coordinatorId);

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function replaceRules(req: Request, input: PutRules) {
  const { user, supabase } = requireUser(req);
  const coordinatorId = resolveCoordinatorId(req, input.coordinatorId);

  const { error: delError } = await supabase
    .from('availability_rules')
    .delete()
    .eq('tenant_id', user.tenantId)
    .eq('coordinator_id', coordinatorId)
    .eq('campus_id', input.campusId);
  if (delError) throw AppError.badRequest(delError.message);

  if (!input.rules.length) return [];

  const rows = input.rules.map((rule) => ({
    tenant_id: user.tenantId,
    coordinator_id: coordinatorId,
    campus_id: input.campusId,
    weekday: rule.weekday,
    start_time: `${rule.startTime}:00`,
    end_time: `${rule.endTime}:00`,
    slot_duration_minutes: rule.slotDurationMinutes,
    capacity: rule.capacity,
    valid_from: rule.validFrom ?? null,
    valid_until: rule.validUntil ?? null,
    is_active: rule.isActive ?? true,
  }));

  const { data, error } = await supabase.from('availability_rules').insert(rows).select();
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function listExceptions(req: Request, query: ListExceptionsQuery) {
  const { user, supabase } = requireUser(req);
  const coordinatorId = user.role === 'coordenador' ? user.id : query.coordinatorId;

  let q = supabase.from('availability_exceptions').select('*').eq('tenant_id', user.tenantId).order('created_at', {
    ascending: false,
  });
  if (coordinatorId) q = q.eq('coordinator_id', coordinatorId);

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createException(req: Request, input: CreateException) {
  const { user, supabase } = requireUser(req);
  const coordinatorId = resolveCoordinatorId(req, input.coordinatorId);

  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw AppError.badRequest('endsAt deve ser posterior a startsAt.');
  }

  const { data, error } = await supabase
    .from('availability_exceptions')
    .insert({
      tenant_id: user.tenantId,
      coordinator_id: coordinatorId,
      period: `[${input.startsAt},${input.endsAt})`,
      kind: input.kind,
      reason: input.reason ?? null,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function deleteException(req: Request, exceptionId: string) {
  const { user, supabase } = requireUser(req);
  let q = supabase.from('availability_exceptions').delete().eq('id', exceptionId).eq('tenant_id', user.tenantId);
  if (user.role === 'coordenador') q = q.eq('coordinator_id', user.id);
  const { error } = await q;
  if (error) throw AppError.badRequest(error.message);
}
