import type { Request } from 'express';
import type { z } from 'zod';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import type {
  listCandidatesQuerySchema,
  publicCandidatePatchSchema,
  publicCandidateSchema,
  updateCandidateSchema,
} from './candidates.schemas.js';

type ListQuery = z.infer<typeof listCandidatesQuerySchema>;
type PublicCandidate = z.infer<typeof publicCandidateSchema>;
type UpdateCandidate = z.infer<typeof updateCandidateSchema>;
type PublicPatch = z.infer<typeof publicCandidatePatchSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

function buildCandidatePatch(input: UpdateCandidate | PublicPatch) {
  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if ('cpf' in input && input.cpf !== undefined) patch.cpf = input.cpf;
  if (input.email !== undefined) patch.email = input.email;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.courseId !== undefined) patch.course_id = input.courseId;
  if (input.campusId !== undefined) patch.campus_id = input.campusId;
  if ('source' in input && input.source !== undefined) patch.source = input.source;
  if ('status' in input && input.status !== undefined) patch.status = input.status;
  if ('preferredFocus' in input && input.preferredFocus !== undefined) patch.preferred_focus = input.preferredFocus;
  if ('availabilityWindows' in input && input.availabilityWindows !== undefined) {
    patch.availability_windows = input.availabilityWindows;
  }
  if ('profileSummary' in input && input.profileSummary !== undefined) patch.profile_summary = input.profileSummary;
  if ('metadata' in input && input.metadata !== undefined) patch.metadata = input.metadata;
  return patch;
}

export async function listCandidates(req: Request, query: ListQuery) {
  const { user, supabase } = requireUser(req);
  const { page, pageSize, from, to } = parsePagination(query);

  let q = supabase
    .from('candidates')
    .select('*', { count: 'exact' })
    .eq('tenant_id', user.tenantId)
    .is('anonymized_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.courseId) q = q.eq('course_id', query.courseId);
  if (query.campusId) q = q.eq('campus_id', query.campusId);
  if (query.status) q = q.eq('status', query.status);
  if (query.source) q = q.eq('source', query.source);
  if (query.from) q = q.gte('created_at', query.from);
  if (query.to) q = q.lte('created_at', query.to);
  if (query.q) q = q.or(`full_name.ilike.%${query.q}%,email.ilike.%${query.q}%,phone.ilike.%${query.q}%,cpf.ilike.%${query.q}%`);

  const { data, error, count } = await q;
  if (error) throw AppError.badRequest(error.message);
  return paginatedResponse(data ?? [], count ?? 0, page, pageSize);
}

export async function getCandidate(req: Request, candidateId: string) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('candidates')
    .select('*, candidate_interests(*, interest_categories(*)), visits(*, visit_status_history(*)), conversion_events(*)')
    .eq('id', candidateId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !data) throw AppError.notFound('Candidato não encontrado.');
  return data;
}

export async function updateCandidate(req: Request, candidateId: string, input: UpdateCandidate) {
  const { user, supabase } = requireUser(req);
  const patch = buildCandidatePatch(input);
  if (!Object.keys(patch).length) return getCandidate(req, candidateId);

  const { data, error } = await supabase
    .from('candidates')
    .update(patch)
    .eq('id', candidateId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Candidato não encontrado.');
  return data;
}

export async function createPublicCandidate(input: PublicCandidate) {
  const admin = getAdminClient();

  const { data: course, error: courseError } = await admin
    .from('courses')
    .select('id, tenant_id, campus_id')
    .eq('id', input.courseId)
    .eq('campus_id', input.campusId)
    .eq('is_active', true)
    .single();
  if (courseError || !course) throw AppError.badRequest('Curso ou campus inválido.');

  const { data: candidate, error } = await admin
    .from('candidates')
    .insert({
      tenant_id: course.tenant_id,
      campus_id: input.campusId,
      course_id: input.courseId,
      full_name: input.fullName,
      cpf: input.cpf,
      email: input.email,
      phone: input.phone,
      source: input.source ?? 'chatbot_publico',
      status: 'novo',
      hygiene_status: 'valid',
      consent_at: new Date().toISOString(),
      consent_source: 'chatbot_publico',
    })
    .select('id, portal_token, full_name, email, phone, cpf, course_id, campus_id, status, created_at')
    .single();

  if (error) {
    if (error.code === '23505') throw AppError.conflict('DUPLICATE_CANDIDATE', 'Candidato já cadastrado.');
    throw AppError.badRequest(error.message);
  }

  const { data: session, error: sessionError } = await admin
    .from('chatbot_sessions')
    .insert({ tenant_id: course.tenant_id, candidate_id: candidate.id, audience: 'candidato', channel: 'web' })
    .select('id')
    .single();
  if (sessionError) throw AppError.badRequest(sessionError.message);

  return { sessionId: session.id, portalToken: candidate.portal_token, candidateId: candidate.id };
}

async function getCandidateByToken(token: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('candidates')
    .select('id, tenant_id, full_name, email, phone, cpf, course_id, campus_id, status, preferred_focus, profile_summary, profile_completed_at, portal_token, availability_windows, created_at')
    .eq('portal_token', token)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Candidato não encontrado.');
  return data;
}

export async function getPublicMe(token: string) {
  return getCandidateByToken(token);
}

export async function updatePublicMe(token: string, input: PublicPatch) {
  const candidate = await getCandidateByToken(token);
  const patch = buildCandidatePatch(input);
  if (!Object.keys(patch).length) return candidate;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('candidates')
    .update(patch)
    .eq('id', candidate.id)
    .select('id, full_name, email, phone, cpf, course_id, campus_id, status, preferred_focus, profile_summary, profile_completed_at, portal_token, availability_windows, created_at')
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function listPublicVisits(token: string) {
  const candidate = await getCandidateByToken(token);
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('visits')
    .select('id, status, type, focus, period, promoter_id, professor_id, campus_id, course_id, created_at')
    .eq('candidate_id', candidate.id)
    .eq('tenant_id', candidate.tenant_id)
    .order('created_at', { ascending: false });
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}
