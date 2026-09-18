import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import type { professorRequirementRuleSchema, updateProfessorProfileSchema } from './professors.schemas.js';

type UpdateProfile = z.infer<typeof updateProfessorProfileSchema>;
type RequirementRule = z.infer<typeof professorRequirementRuleSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function updateMyProfile(req: Request, input: UpdateProfile) {
  const { user, supabase } = requireUser(req);
  if (user.role !== 'professor') throw AppError.forbidden();

  const patch: Record<string, unknown> = { profile_id: user.id };
  if (input.area !== undefined) patch.area = input.area;
  if (input.topics !== undefined) patch.topics = input.topics;
  if (input.acceptsVisits !== undefined) patch.accepts_visits = input.acceptsVisits;
  if (input.isSubstitute !== undefined) patch.is_substitute = input.isSubstitute;

  const { data, error } = await supabase.from('professor_profiles').upsert(patch).select().single();
  if (error) throw AppError.badRequest(error.message);

  if (input.courseIds) {
    await supabase.from('professor_courses').delete().eq('professor_id', user.id);
    if (input.courseIds.length) {
      const { error: courseError } = await supabase
        .from('professor_courses')
        .insert(input.courseIds.map((courseId) => ({ professor_id: user.id, course_id: courseId })));
      if (courseError) throw AppError.badRequest(courseError.message);
    }
  }

  return data;
}

export async function listMyRequests(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('visit_invitations')
    .select('*, visits(id, status, focus, period, candidates(full_name, profile_summary))')
    .eq('profile_id', user.id)
    .eq('role', 'professor')
    .eq('status', 'pending')
    .order('sent_at', { ascending: false });
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function listMyVisits(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('visits')
    .select('id, status, focus, period, campus_id, course_id, candidates(full_name)')
    .eq('tenant_id', user.tenantId)
    .eq('professor_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function listRequirementRules(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('professor_requirement_rules')
    .select('*')
    .eq('tenant_id', user.tenantId)
    .order('priority');
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createRequirementRule(req: Request, input: RequirementRule) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('professor_requirement_rules')
    .insert({
      tenant_id: user.tenantId,
      course_id: input.courseId ?? null,
      focus: input.focus ?? null,
      interest_category_id: input.interestCategoryId ?? null,
      requirement: input.requirement,
      priority: input.priority,
      is_active: input.isActive,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updateRequirementRule(req: Request, ruleId: string, input: Partial<RequirementRule>) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.courseId !== undefined) patch.course_id = input.courseId;
  if (input.focus !== undefined) patch.focus = input.focus;
  if (input.interestCategoryId !== undefined) patch.interest_category_id = input.interestCategoryId;
  if (input.requirement !== undefined) patch.requirement = input.requirement;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase
    .from('professor_requirement_rules')
    .update(patch)
    .eq('id', ruleId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Regra não encontrada.');
  return data;
}

export async function deleteRequirementRule(req: Request, ruleId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase
    .from('professor_requirement_rules')
    .update({ is_active: false })
    .eq('id', ruleId)
    .eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}
