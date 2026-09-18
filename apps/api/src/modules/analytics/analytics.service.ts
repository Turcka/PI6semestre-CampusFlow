import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import type { analyticsFilterSchema, timeseriesQuerySchema } from './analytics.schemas.js';

type Filters = z.infer<typeof analyticsFilterSchema>;
type Timeseries = z.infer<typeof timeseriesQuerySchema>;

const cache = new Map<string, { expiresAt: number; value: unknown }>();
const TTL_MS = 60_000;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await loader();
  cache.set(key, { expiresAt: Date.now() + TTL_MS, value });
  return value;
}

function applyCommonFilters<T extends { eq: Function; gte: Function; lte: Function }>(
  q: T,
  query: Filters,
  dateColumn = 'day',
): T {
  if (query.campusId) q = q.eq('campus_id', query.campusId);
  if (query.courseId) q = q.eq('course_id', query.courseId);
  if (query.promoterId) q = q.eq('promoter_id', query.promoterId);
  if (query.status) q = q.eq('status', query.status);
  if (query.from) q = q.gte(dateColumn, query.from);
  if (query.to) q = q.lte(dateColumn, query.to);
  return q;
}

export async function overview(req: Request, query: Filters) {
  const { user, supabase } = requireUser(req);
  const key = `overview:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('vw_visits_kpis').select('*').eq('tenant_id', user.tenantId);
    q = applyCommonFilters(q, query);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}

export async function visitsByCourse(req: Request, query: Filters) {
  const { user, supabase } = requireUser(req);
  const key = `by-course:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('vw_visits_kpis').select('course_id, total, confirmed, completed, absent, cancelled').eq('tenant_id', user.tenantId);
    q = applyCommonFilters(q, query);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}

export async function visitsByPromoter(req: Request, query: Filters) {
  const { user, supabase } = requireUser(req);
  const key = `by-promoter:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('vw_visits_kpis').select('promoter_id, total, confirmed, completed, absent').eq('tenant_id', user.tenantId);
    q = applyCommonFilters(q, query);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}

export async function occupancy(req: Request, query: Filters) {
  const { user, supabase } = requireUser(req);
  const key = `occupancy:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('vw_slot_occupancy').select('*').eq('tenant_id', user.tenantId);
    q = applyCommonFilters(q, query);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}

export async function reassignments(req: Request, query: Filters) {
  const { user, supabase } = requireUser(req);
  const key = `reassignments:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('vw_reassignment_metrics').select('*').eq('tenant_id', user.tenantId);
    q = applyCommonFilters(q, query, 'day');
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}

export async function promoters(req: Request, query: Filters) {
  const { user, supabase } = requireUser(req);
  const key = `promoters:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('vw_promoter_performance').select('*').eq('tenant_id', user.tenantId);
    if (query.promoterId) q = q.eq('promoter_id', query.promoterId);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}

export async function conversion(req: Request, query: Filters) {
  const { user, supabase } = requireUser(req);
  const key = `conversion:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('vw_conversion').select('*').eq('tenant_id', user.tenantId);
    q = applyCommonFilters(q, query);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}

export async function timeseries(req: Request, query: Timeseries) {
  const { user, supabase } = requireUser(req);
  const key = `timeseries:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('mv_visits_daily').select('*').eq('tenant_id', user.tenantId).order('day');
    if (query.from) q = q.gte('day', query.from);
    if (query.to) q = q.lte('day', query.to);
    if (query.campusId) q = q.eq('campus_id', query.campusId);
    if (query.courseId) q = q.eq('course_id', query.courseId);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return { metric: query.metric, points: data ?? [] };
  });
}
