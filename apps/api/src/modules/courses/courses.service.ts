import type { Request } from 'express';

import { AppError } from '../../utils/app-error.js';
import type { createCourseSchema, listCoursesQuerySchema, updateCourseSchema } from './courses.schemas.js';
import type { z } from 'zod';

type CreateCourse = z.infer<typeof createCourseSchema>;
type UpdateCourse = z.infer<typeof updateCourseSchema>;
type ListQuery = z.infer<typeof listCoursesQuerySchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listCourses(req: Request, query: ListQuery) {
  const { user, supabase } = requireUser(req);
  let q = supabase.from('courses').select('*').eq('tenant_id', user.tenantId).order('name');
  if (query.campusId) q = q.eq('campus_id', query.campusId);
  if (query.isActive !== undefined) q = q.eq('is_active', query.isActive);
  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createCourse(req: Request, input: CreateCourse) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('courses')
    .insert({
      tenant_id: user.tenantId,
      campus_id: input.campusId,
      name: input.name,
      code: input.code ?? null,
      description: input.description ?? null,
      is_active: input.isActive ?? true,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updateCourse(req: Request, courseId: string, input: UpdateCourse) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.campusId !== undefined) patch.campus_id = input.campusId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.code !== undefined) patch.code = input.code;
  if (input.description !== undefined) patch.description = input.description;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase
    .from('courses')
    .update(patch)
    .eq('id', courseId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Curso não encontrado.');
  return data;
}

export async function deleteCourse(req: Request, courseId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase.from('courses').delete().eq('id', courseId).eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}
