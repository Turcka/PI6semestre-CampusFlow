import type { Request } from 'express';

import { AppError } from '../../utils/app-error.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import type { listUsersQuerySchema, updateUserSchema } from './users.schemas.js';
import type { z } from 'zod';

type ListQuery = z.infer<typeof listUsersQuerySchema>;
type UpdateUser = z.infer<typeof updateUserSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listUsers(req: Request, query: ListQuery) {
  const { user, supabase } = requireUser(req);
  const { page, pageSize, from, to } = parsePagination(query);

  let q = supabase
    .from('profiles')
    .select('id, tenant_id, full_name, email, phone, role, avatar_url, is_active, created_at', { count: 'exact' })
    .eq('tenant_id', user.tenantId)
    .order('full_name')
    .range(from, to);

  if (query.role) q = q.eq('role', query.role);
  if (query.isActive !== undefined) q = q.eq('is_active', query.isActive);
  if (query.q) q = q.or(`full_name.ilike.%${query.q}%,email.ilike.%${query.q}%`);

  const { data, error, count } = await q;
  if (error) throw AppError.badRequest(error.message);
  return paginatedResponse(data ?? [], count ?? 0, page, pageSize);
}

export async function updateUser(req: Request, userId: string, input: UpdateUser) {
  const { user, supabase } = requireUser(req);

  const patch: Record<string, unknown> = {};
  if (input.role !== undefined) patch.role = input.role;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.fullName !== undefined) patch.full_name = input.fullName;

  if (Object.keys(patch).length) {
    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .eq('tenant_id', user.tenantId);
    if (error) throw AppError.badRequest(error.message);
  }

  if (input.courseIds !== undefined) {
    const { error: delError } = await supabase.from('coordinator_courses').delete().eq('coordinator_id', userId);
    if (delError) throw AppError.badRequest(delError.message);

    if (input.courseIds.length) {
      const rows = input.courseIds.map((courseId) => ({
        coordinator_id: userId,
        course_id: courseId,
      }));
      const { error: insError } = await supabase.from('coordinator_courses').insert(rows);
      if (insError) throw AppError.badRequest(insError.message);
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, tenant_id, full_name, email, phone, role, avatar_url, is_active')
    .eq('id', userId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !data) throw AppError.notFound('Usuário não encontrado.');

  const { data: courses } = await supabase
    .from('coordinator_courses')
    .select('course_id')
    .eq('coordinator_id', userId);

  return { ...data, courseIds: (courses ?? []).map((c) => c.course_id) };
}
