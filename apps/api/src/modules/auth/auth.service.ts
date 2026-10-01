import type { CreateUserInput, InviteUserInput } from '@campusflow/shared';
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
    const { error } = await admin.from('promoter_profiles').upsert({
      profile_id: userId,
      accepts_auto_match: true,
      max_visits_per_day: 4,
    });
    if (error) throw AppError.badRequest(error.message);
  }
  if (role === 'professor') {
    const { error } = await admin.from('professor_profiles').upsert({
      profile_id: userId,
      accepts_visits: true,
      is_substitute: false,
    });
    if (error) throw AppError.badRequest(error.message);
  }
}

async function linkCourses(userId: string, role: InviteUserInput['role'], courseIds?: string[]) {
  if (!courseIds?.length || role === 'admin') return;
  const admin = getAdminClient();
  const table = role === 'professor' ? 'professor_courses' : 'promoter_courses';
  const idColumn = role === 'professor' ? 'professor_id' : 'promoter_id';
  await admin.from(table).delete().eq(idColumn, userId);
  const rows = courseIds.map((courseId) =>
    role === 'professor'
      ? { professor_id: userId, course_id: courseId, is_primary: true }
      : { promoter_id: userId, course_id: courseId, familiarity: 3 },
  );
  const { error } = await admin.from(table).upsert(rows);
  if (error) throw AppError.badRequest(error.message);
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
  await linkCourses(data.user.id, input.role, input.courseIds);

  const { data: profile } = await admin
    .from('profiles')
    .select('id, tenant_id, full_name, email, role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  return profile ?? { id: data.user.id, email: input.email, role: input.role, full_name: input.fullName };
}

export async function createUserWithPassword(req: Request, input: CreateUserInput) {
  if (!req.user) throw AppError.unauthorized();

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      tenant_id: req.user.tenantId,
      role: input.role,
      full_name: input.fullName,
    },
  });

  if (error) throw AppError.badRequest(error.message);
  if (!data.user) throw AppError.badRequest('Falha ao criar usuário.');

  await admin.from('profiles').upsert({
    id: data.user.id,
    tenant_id: req.user.tenantId,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    is_active: true,
  });

  await ensureSpecificProfile(data.user.id, input.role);
  await linkCourses(data.user.id, input.role, input.courseIds);

  return {
    id: data.user.id,
    email: input.email,
    role: input.role,
    full_name: input.fullName,
    status: 'active' as const,
  };
}
