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

function isSelfManagedRole(role: string) {
  return role === 'promotor' || role === 'professor';
}

function resolveOwnerId(req: Request, requested?: string) {
  const { user } = requireUser(req);
  if (isSelfManagedRole(user.role)) {
    if (requested && requested !== user.id) throw AppError.forbidden('Você só pode gerenciar a própria disponibilidade.');
    return user.id;
  }
  if (!requested) throw AppError.badRequest('ownerId é obrigatório.');
  return requested;
}

export async function listRules(req: Request, query: ListRulesQuery) {
  const { user, supabase } = requireUser(req);
  const ownerId = isSelfManagedRole(user.role) ? user.id : query.ownerId ?? null;

  let q = supabase.from('availability_rules').select('*').eq('tenant_id', user.tenantId).order('weekday');
  if (ownerId) q = q.eq('owner_id', ownerId);

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function replaceRules(req: Request, input: PutRules) {
  const { user, supabase } = requireUser(req);
  const ownerId = resolveOwnerId(req, input.ownerId);

  const { error: delError } = await supabase
    .from('availability_rules')
    .delete()
    .eq('tenant_id', user.tenantId)
    .eq('owner_id', ownerId)
    .eq('campus_id', input.campusId);
  if (delError) throw AppError.badRequest(delError.message);

  if (!input.rules.length) return [];

  const rows = input.rules.map((rule) => ({
    tenant_id: user.tenantId,
    owner_id: ownerId,
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
  const ownerId = isSelfManagedRole(user.role) ? user.id : query.ownerId;

  let q = supabase.from('availability_exceptions').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
  if (ownerId) q = q.eq('owner_id', ownerId);
  if (query.from) q = q.gte('created_at', query.from);
  if (query.to) q = q.lte('created_at', query.to);

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createException(req: Request, input: CreateException) {
  const { user, supabase } = requireUser(req);
  const ownerId = resolveOwnerId(req, input.ownerId);

  if (new Date(input.endsAt) <= new Date(input.startsAt)) throw AppError.badRequest('endsAt deve ser posterior a startsAt.');

  const { data, error } = await supabase
    .from('availability_exceptions')
    .insert({ tenant_id: user.tenantId, owner_id: ownerId, period: `[${input.startsAt},${input.endsAt})`, kind: input.kind, reason: input.reason ?? null })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function deleteException(req: Request, exceptionId: string) {
  const { user, supabase } = requireUser(req);
  let q = supabase.from('availability_exceptions').delete().eq('id', exceptionId).eq('tenant_id', user.tenantId);
  if (isSelfManagedRole(user.role)) q = q.eq('owner_id', user.id);
  const { error } = await q;
  if (error) throw AppError.badRequest(error.message);
}
