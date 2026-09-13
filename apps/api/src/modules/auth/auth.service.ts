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

  const [{ data: tenant }, { data: campuses }, { data: courses }] = await Promise.all([
    req.supabase.from('tenants').select('id, name, slug, timezone, logo_url, settings').eq('id', req.user.tenantId).single(),
    req.supabase
      .from('campuses')
      .select('id, name, slug, address, city, state, latitude, longitude, is_active')
      .eq('tenant_id', req.user.tenantId)
      .order('name'),
    req.supabase
      .from('coordinator_courses')
      .select('course_id, courses(id, name, campus_id)')
      .eq('coordinator_id', req.user.id),
  ]);

  return {
    profile,
    tenant,
    campuses: campuses ?? [],
    courseIds: (courses ?? []).map((c) => c.course_id),
    courses: (courses ?? []).map((c) => c.courses).filter(Boolean),
  };
}

export async function inviteUser(req: Request, input: InviteUserInput) {
  if (!req.user) throw AppError.unauthorized();

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: {
      tenant_id: req.user.tenantId,
      role: input.role,
      full_name: input.fullName,
    },
  });

  if (error) throw AppError.badRequest(error.message);
  if (!data.user) throw AppError.badRequest('Falha ao convidar usuário.');

  if (input.courseIds?.length) {
    const rows = input.courseIds.map((courseId) => ({
      coordinator_id: data.user!.id,
      course_id: courseId,
    }));
    const { error: linkError } = await admin.from('coordinator_courses').upsert(rows);
    if (linkError) throw AppError.badRequest(linkError.message);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, tenant_id, full_name, email, role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  return profile ?? { id: data.user.id, email: input.email, role: input.role, full_name: input.fullName };
}
