import type { InviteUserInput } from '@campusflow/shared';
import type { Request } from 'express';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';

export async function getMe(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();

  const { data: profile, error } = await req.supabase
    .from('profiles')
    .select('id, tenant_id, full_name, email, phone, role, avatar_url, is_active')
    .eq('id', req.user.id)
    .single();

  if (error || !profile) throw AppError.notFound('Perfil não encontrado.');

  const courseTable = req.user.role === 'professor' ? 'professor_courses' : 'promoter_courses';
  const idColumn = req.user.role === 'professor' ? 'professor_id' : 'promoter_id';
  const [{ data: tenant }, { data: campuses }, coursesResult] = await Promise.all([
    req.supabase.from('tenants').select('id, name, slug, timezone, logo_url, settings').eq('id', req.user.tenantId).single(),
    req.supabase
      .from('campuses')
      .select('id, name, slug, address, city, state, latitude, longitude, is_active')
      .eq('tenant_id', req.user.tenantId)
      .order('name'),
    req.user.role === 'admin'
      ? Promise.resolve({ data: [] })
      : req.supabase.from(courseTable).select('course_id, courses(id, name, campus_id)').eq(idColumn, req.user.id),
  ]);
  const courses = coursesResult.data ?? [];

  return {
    profile,
    tenant,
    campuses: campuses ?? [],
    courseIds: courses.map((c) => c.course_id),
    courses: courses.map((c) => c.courses).filter(Boolean),
  };
}

async function ensureSpecificProfile(userId: string, role: InviteUserInput['role']) {
  const admin = getAdminClient();
  if (role === 'promotor') {
    const { error } = await admin.from('promoter_profiles').upsert({ profile_id: userId });
    if (error) throw AppError.badRequest(error.message);
  }
  if (role === 'professor') {
    const { error } = await admin.from('professor_profiles').upsert({ profile_id: userId });
    if (error) throw AppError.badRequest(error.message);
  }
}

export async function inviteUser(req: Request, input: InviteUserInput) {
  if (!req.user) throw AppError.unauthorized();

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { tenant_id: req.user.tenantId, role: input.role, full_name: input.fullName },
  });

  if (error) throw AppError.badRequest(error.message);
  if (!data.user) throw AppError.badRequest('Falha ao convidar usuário.');

  await ensureSpecificProfile(data.user.id, input.role);

  if (input.courseIds?.length && input.role !== 'admin') {
    const table = input.role === 'professor' ? 'professor_courses' : 'promoter_courses';
    const idColumn = input.role === 'professor' ? 'professor_id' : 'promoter_id';
    const rows = input.courseIds.map((courseId) => ({ [idColumn]: data.user!.id, course_id: courseId }));
    const { error: linkError } = await admin.from(table).upsert(rows);
    if (linkError) throw AppError.badRequest(linkError.message);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, tenant_id, full_name, email, role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  return profile ?? { id: data.user.id, email: input.email, role: input.role, full_name: input.fullName };
}
