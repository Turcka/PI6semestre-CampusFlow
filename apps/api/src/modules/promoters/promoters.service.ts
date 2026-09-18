import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import type {
  listMyVisitsQuerySchema,
  listPromotersQuerySchema,
  updatePromoterProfileSchema,
} from './promoters.schemas.js';

type UpdateProfile = z.infer<typeof updatePromoterProfileSchema>;
type ListQuery = z.infer<typeof listPromotersQuerySchema>;
type MyVisitsQuery = z.infer<typeof listMyVisitsQuerySchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listPromoters(req: Request, query: ListQuery) {
  const { user, supabase } = requireUser(req);
  let q = supabase
    .from('profiles')
    .select('id, full_name, email, is_active, promoter_profiles(*)')
    .eq('tenant_id', user.tenantId)
    .eq('role', 'promotor')
    .order('full_name');
  if (query.q) q = q.or(`full_name.ilike.%${query.q}%,email.ilike.%${query.q}%`);
  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function getPromoter(req: Request, promoterId: string) {
  const { user, supabase } = requireUser(req);
  if (user.role !== 'admin' && user.id !== promoterId) throw AppError.forbidden();

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, is_active, promoter_profiles(*, promoter_interests(*, interest_categories(*)), promoter_pois(poi_id), promoter_courses(course_id, familiarity))',
    )
    .eq('id', promoterId)
    .eq('tenant_id', user.tenantId)
    .eq('role', 'promotor')
    .single();
  if (error || !data) throw AppError.notFound('Promotor não encontrado.');
  return data;
}

export async function updateMyProfile(req: Request, input: UpdateProfile) {
  const { user, supabase } = requireUser(req);
  if (user.role !== 'promotor' && user.role !== 'admin') throw AppError.forbidden();
  const profileId = user.role === 'promotor' ? user.id : user.id;

  const patch: Record<string, unknown> = {};
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.traits !== undefined) patch.traits = input.traits;
  if (input.preferredFocus !== undefined) patch.preferred_focus = input.preferredFocus;
  if (input.experienceLevel !== undefined) patch.experience_level = input.experienceLevel;
  if (input.maxVisitsPerDay !== undefined) patch.max_visits_per_day = input.maxVisitsPerDay;
  if (input.acceptsAutoMatch !== undefined) patch.accepts_auto_match = input.acceptsAutoMatch;

  const { data, error } = await supabase
    .from('promoter_profiles')
    .upsert({ profile_id: profileId, ...patch })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);

  if (input.courseFamiliarity) {
    await supabase.from('promoter_courses').delete().eq('promoter_id', profileId);
    if (input.courseFamiliarity.length) {
      const { error: courseError } = await supabase.from('promoter_courses').insert(
        input.courseFamiliarity.map((c) => ({
          promoter_id: profileId,
          course_id: c.courseId,
          familiarity: c.familiarity,
        })),
      );
      if (courseError) throw AppError.badRequest(courseError.message);
    }
  }

  if (input.interests) {
    await supabase.from('promoter_interests').delete().eq('promoter_id', profileId);
    if (input.interests.length) {
      const { error: interestError } = await supabase.from('promoter_interests').insert(
        input.interests.map((i) => ({
          promoter_id: profileId,
          category_id: i.categoryId,
          level: i.level,
        })),
      );
      if (interestError) throw AppError.badRequest(interestError.message);
    }
  }

  if (input.poiIds) {
    await supabase.from('promoter_pois').delete().eq('promoter_id', profileId);
    if (input.poiIds.length) {
      const { error: poiError } = await supabase.from('promoter_pois').insert(
        input.poiIds.map((poiId) => ({ promoter_id: profileId, poi_id: poiId })),
      );
      if (poiError) throw AppError.badRequest(poiError.message);
    }
  }

  return data;
}

export async function listMyVisits(req: Request, query: MyVisitsQuery) {
  const { user, supabase } = requireUser(req);
  let q = supabase
    .from('visits')
    .select('id, status, focus, period, campus_id, course_id, candidates(full_name, profile_summary, preferred_focus)')
    .eq('tenant_id', user.tenantId)
    .eq('promoter_id', user.id)
    .order('created_at', { ascending: false });
  if (query.status) q = q.eq('status', query.status);
  if (query.from) q = q.gte('created_at', query.from);
  if (query.to) q = q.lte('created_at', query.to);
  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function getMyHistory(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data: profile } = await supabase.from('promoter_profiles').select('*').eq('profile_id', user.id).maybeSingle();
  const { count: completed } = await supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .eq('promoter_id', user.id)
    .eq('status', 'realizada');
  const { count: absent } = await supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .eq('promoter_id', user.id)
    .eq('status', 'ausente');
  const { count: reassignments } = await supabase
    .from('visit_reassignments')
    .select('id', { count: 'exact', head: true })
    .eq('from_profile_id', user.id);

  const total = (completed ?? 0) + (absent ?? 0);
  return {
    profile,
    visitsCompleted: completed ?? 0,
    attendanceRate: total ? (completed ?? 0) / total : null,
    reassignments: reassignments ?? 0,
  };
}
