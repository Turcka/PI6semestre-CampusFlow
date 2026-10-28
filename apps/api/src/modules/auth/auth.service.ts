import type { CreateUserInput, InviteUserInput, UpdateMeInput } from '@campusflow/shared';
import type { Request } from 'express';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';

const PROFILE_COLUMNS = 'id, tenant_id, full_name, email, phone, role, avatar_url, birth_date, is_active, is_banned';

export type OnboardingState = {
  completed: boolean;
  missing: string[];
  completedAt: string | null;
  testExpiresAt: string | null;
  sessionId: string | null;
};

/** Estado de aptidão do promotor (view vw_promoter_eligibility + promoter_profiles). */
export async function getPromoterOnboarding(profileId: string): Promise<OnboardingState> {
  const admin = getAdminClient();
  const [{ data: report }, { data: promoter }] = await Promise.all([
    admin.from('vw_promoter_eligibility').select('eligible, missing').eq('profile_id', profileId).maybeSingle(),
    admin
      .from('promoter_profiles')
      .select('onboarding_completed_at, behavioral_test_expires_at, onboarding_session_id')
      .eq('profile_id', profileId)
      .maybeSingle(),
  ]);

  return {
    completed: Boolean(report?.eligible),
    missing: (report?.missing as string[] | null) ?? ['onboarding'],
    completedAt: promoter?.onboarding_completed_at ?? null,
    testExpiresAt: promoter?.behavioral_test_expires_at ?? null,
    sessionId: promoter?.onboarding_session_id ?? null,
  };
}

export async function getMe(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();

  const { data: profile, error } = await req.supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', req.user.id).single();

  if (error || !profile) throw AppError.notFound('Perfil não encontrado.');

  const courseTable = req.user.role === 'professor' ? 'professor_courses' : 'promoter_courses';
  const idColumn = req.user.role === 'professor' ? 'professor_id' : 'promoter_id';
  const [{ data: tenant }, { data: campuses }, coursesResult, onboarding] = await Promise.all([
    req.supabase.from('tenants').select('id, name, slug, timezone, logo_url, settings').eq('id', req.user.tenantId).single(),
    req.supabase
      .from('campuses')
      .select('id, name, slug, address, city, state, latitude, longitude, is_active')
      .eq('tenant_id', req.user.tenantId)
      .order('name'),
    req.user.role === 'admin'
      ? Promise.resolve({ data: [] })
      : req.supabase.from(courseTable).select('course_id, courses(id, name, campus_id)').eq(idColumn, req.user.id),
    req.user.role === 'promotor' ? getPromoterOnboarding(req.user.id) : Promise.resolve(null),
  ]);
  const courses = coursesResult.data ?? [];

  return {
    profile,
    tenant,
    campuses: campuses ?? [],
    courseIds: courses.map((c) => c.course_id),
    courses: courses.map((c) => c.courses).filter(Boolean),
    onboarding,
  };
}

/** PATCH /auth/me — auto-edição: nome, telefone, nascimento e foto (só no próprio diretório do bucket). */
export async function updateMe(req: Request, input: UpdateMeInput) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();

  if (input.avatarUrl) {
    const expected = `/storage/v1/object/public/avatars/${req.user.id}/`;
    if (!input.avatarUrl.includes(expected)) {
      throw AppError.badRequest('A foto deve ser enviada para o seu próprio diretório no bucket "avatars".');
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.birthDate !== undefined) patch.birth_date = input.birthDate;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;

  // Cliente do usuário (RLS profiles_update_self); o trigger check_promoter_adult valida 18+.
  const { data, error } = await req.supabase.from('profiles').update(patch).eq('id', req.user.id).select(PROFILE_COLUMNS).single();
  if (error) mapRpcError(error);

  return getMe(req).then((me) => ({ ...me, profile: data ?? me.profile }));
}

async function ensureSpecificProfile(userId: string, role: InviteUserInput['role']) {
  const admin = getAdminClient();
  if (role === 'promotor') {
    const { error } = await admin.from('promoter_profiles').upsert({
      profile_id: userId,
      accepts_auto_match: true,
      max_visits_per_day: 1,
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
    data: {
      tenant_id: req.user.tenantId,
      role: input.role,
      full_name: input.fullName,
      phone: input.phone ?? null,
      birth_date: input.birthDate ?? null,
    },
  });

  if (error) throw AppError.badRequest(error.message);
  if (!data.user) throw AppError.badRequest('Falha ao convidar usuário.');

  if (input.birthDate || input.phone) {
    await admin
      .from('profiles')
      .update({ birth_date: input.birthDate ?? null, phone: input.phone ?? null })
      .eq('id', data.user.id);
  }
  await ensureSpecificProfile(data.user.id, input.role);
  await linkCourses(data.user.id, input.role, input.courseIds);

  const { data: profile } = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', data.user.id).maybeSingle();

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
      phone: input.phone ?? null,
      birth_date: input.birthDate ?? null,
    },
  });

  if (error) throw AppError.badRequest(error.message);
  if (!data.user) throw AppError.badRequest('Falha ao criar usuário.');

  const { error: profileError } = await admin.from('profiles').upsert({
    id: data.user.id,
    tenant_id: req.user.tenantId,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    birth_date: input.birthDate ?? null,
    role: input.role,
    is_active: true,
  });
  if (profileError) {
    // desfaz a conta de auth para não deixar usuário órfão (ex.: PROMOTER_UNDERAGE)
    await admin.auth.admin.deleteUser(data.user.id);
    mapRpcError(profileError);
  }

  await ensureSpecificProfile(data.user.id, input.role);
  await linkCourses(data.user.id, input.role, input.courseIds);

  return {
    id: data.user.id,
    email: input.email,
    role: input.role,
    full_name: input.fullName,
    birth_date: input.birthDate ?? null,
    status: 'active' as const,
  };
}
