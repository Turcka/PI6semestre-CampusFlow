import type { Request } from 'express';
import type { z } from 'zod';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import type { banUserSchema, listUsersQuerySchema, updateUserSchema } from './users.schemas.js';

type ListQuery = z.infer<typeof listUsersQuerySchema>;
type UpdateUser = z.infer<typeof updateUserSchema>;
type BanInput = z.infer<typeof banUserSchema>;

const PROFILE_COLUMNS =
  'id, tenant_id, full_name, email, phone, role, avatar_url, birth_date, is_active, is_banned, banned_at, ban_reason, created_at';

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

type EligibilityRow = { profile_id: string; eligible: boolean; missing: string[] };

/** Aptidão dos promotores (view vw_promoter_eligibility, regra única no banco). */
export async function loadPromoterEligibility(profileIds: string[]): Promise<Map<string, EligibilityRow>> {
  const map = new Map<string, EligibilityRow>();
  if (!profileIds.length) return map;
  const { data, error } = await getAdminClient()
    .from('vw_promoter_eligibility')
    .select('profile_id, eligible, missing')
    .in('profile_id', profileIds);
  if (error) throw AppError.badRequest(error.message);
  for (const row of (data ?? []) as EligibilityRow[]) map.set(row.profile_id, row);
  return map;
}

export async function listUsers(req: Request, query: ListQuery) {
  const { user, supabase } = requireUser(req);
  const { page, pageSize, from, to } = parsePagination(query);

  let q = supabase
    .from('profiles')
    .select(PROFILE_COLUMNS, { count: 'exact' })
    .eq('tenant_id', user.tenantId)
    .order('full_name')
    .range(from, to);

  if (query.role) q = q.eq('role', query.role);
  if (query.isActive !== undefined) q = q.eq('is_active', query.isActive);
  if (query.assignable) q = q.eq('is_active', true).eq('is_banned', false);
  else if (!query.includeBanned && query.assignable === undefined && query.isActive === undefined) {
    // listagem padrão mostra todos (inclusive banidos) para o admin moderar
  }
  if (query.q) q = q.or(`full_name.ilike.%${query.q}%,email.ilike.%${query.q}%`);

  const { data, error, count } = await q;
  if (error) throw AppError.badRequest(error.message);

  const rows = data ?? [];
  const promoterIds = rows.filter((r) => r.role === 'promotor').map((r) => r.id);
  const eligibility = await loadPromoterEligibility(promoterIds);

  const enriched = rows.map((row) => {
    if (row.role !== 'promotor') return { ...row, eligible: null, eligibilityMissing: [] as string[] };
    const report = eligibility.get(row.id);
    return {
      ...row,
      eligible: report?.eligible ?? false,
      eligibilityMissing: report?.missing ?? ['onboarding'],
    };
  });

  return paginatedResponse(enriched, count ?? 0, page, pageSize);
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
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.birthDate !== undefined) patch.birth_date = input.birthDate;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;

  if (Object.keys(patch).length) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId).eq('tenant_id', user.tenantId);
    if (error) mapRpcError(error);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
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

/** Banir: bloqueia login (Supabase Auth + profiles.is_banned), libera visitas futuras, mantém histórico. */
export async function banUser(req: Request, userId: string, input: BanInput) {
  const { user } = requireUser(req);
  const admin = getAdminClient();

  const { data, error } = await admin.rpc('ban_profile', {
    p_profile_id: userId,
    p_actor: user.id,
    p_reason: input.reason,
  });
  if (error) mapRpcError(error);

  // 10 anos ≈ banimento indefinido; sessões ativas param de passar no authMiddleware imediatamente.
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: '87600h' });
  if (authError) throw AppError.badRequest(`Perfil banido, mas falhou ao bloquear o login: ${authError.message}`);

  return data;
}

export async function unbanUser(req: Request, userId: string) {
  const { user } = requireUser(req);
  const admin = getAdminClient();

  const { data, error } = await admin.rpc('unban_profile', { p_profile_id: userId, p_actor: user.id });
  if (error) mapRpcError(error);

  const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (authError) throw AppError.badRequest(`Perfil reativado, mas falhou ao liberar o login: ${authError.message}`);

  return data;
}

/** Expulsar: libera visitas futuras, registra auditoria e apaga a conta (profiles em cascata, FKs em SET NULL). */
export async function removeUser(req: Request, userId: string) {
  const { user } = requireUser(req);
  const admin = getAdminClient();

  const { data, error } = await admin.rpc('prepare_profile_removal', { p_profile_id: userId, p_actor: user.id });
  if (error) mapRpcError(error);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    // conta de auth pode já não existir (usuário criado só em profiles); garante a remoção do perfil
    const { error: profileError } = await admin.from('profiles').delete().eq('id', userId).eq('tenant_id', user.tenantId);
    if (profileError) throw AppError.badRequest(`Falha ao remover a conta: ${deleteError.message}`);
  }

  return { ok: true, ...(data as Record<string, unknown>) };
}
