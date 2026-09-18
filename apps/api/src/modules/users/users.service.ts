import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import type { listUsersQuerySchema, updateUserSchema } from './users.schemas.js';

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

async function replaceCourseLinks(req: Request, userId: string, role: string, courseIds: string[]) {
  const { supabase } = requireUser(req);
  await supabase.from('promoter_courses').delete().eq('promoter_id', userId);
  await supabase.from('professor_courses').delete().eq('professor_id', userId);

  if (!courseIds.length || role === 'admin') return;
  const table = role === 'professor' ? 'professor_courses' : 'promoter_courses';
  const idColumn = role === 'professor' ? 'professor_id' : 'promoter_id';
  const rows = courseIds.map((courseId) => ({ [idColumn]: userId, course_id: courseId }));
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw AppError.badRequest(error.message);
}

export async function updateUser(req: Request, userId: string, input: UpdateUser) {
  const { user, supabase } = requireUser(req);

  const patch: Record<string, unknown> = {};
  if (input.role !== undefined) patch.role = input.role;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.fullName !== undefined) patch.full_name = input.fullName;

  if (Object.keys(patch).length) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId).eq('tenant_id', user.tenantId);
    if (error) throw AppError.badRequest(error.message);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, tenant_id, full_name, email, phone, role, avatar_url, is_active')
    .eq('id', userId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (profileError || !profile) throw AppError.notFound('Usuário não encontrado.');

  if (profile.role === 'promotor') await supabase.from('promoter_profiles').upsert({ profile_id: userId });
  if (profile.role === 'professor') await supabase.from('professor_profiles').upsert({ profile_id: userId });
  if (input.courseIds !== undefined) await replaceCourseLinks(req, userId, profile.role, input.courseIds);

  const table = profile.role === 'professor' ? 'professor_courses' : 'promoter_courses';
  const idColumn = profile.role === 'professor' ? 'professor_id' : 'promoter_id';
  const { data: courses } = profile.role === 'admin' ? { data: [] } : await supabase.from(table).select('course_id').eq(idColumn, userId);

  return { ...profile, courseIds: (courses ?? []).map((c) => c.course_id) };
}
