import { MATRICULATION_PRIORITIES, MATRICULATION_PRIORITY_LABELS, type MatriculationPriority } from '@campusflow/shared';
import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import type { analyticsFilterSchema, prioritiesQuerySchema, timeseriesQuerySchema } from './analytics.schemas.js';

type Filters = z.infer<typeof analyticsFilterSchema>;
type PrioritiesQuery = z.infer<typeof prioritiesQuerySchema>;
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

export type PriorityRow = { priority_key: string | null; rank: number | string | null; candidates: number | string | null };

/**
 * Agrega as linhas de `vw_candidate_priorities` (uma por curso/prioridade/posição) por prioridade.
 * `respondents` conta candidatos com ao menos uma prioridade: todo ranking tem a posição 1.
 */
export function aggregatePriorities(rows: PriorityRow[]) {
  const known = new Set<string>(MATRICULATION_PRIORITIES);
  const byKey = new Map<string, { mentions: number; top1: number; rankSum: number }>();
  let respondents = 0;
  for (const row of rows) {
    const count = Number(row.candidates ?? 0);
    const rank = Number(row.rank ?? 0);
    if (!row.priority_key || !known.has(row.priority_key) || !Number.isFinite(count) || count <= 0 || !Number.isFinite(rank) || rank < 1) {
      continue;
    }
    const current = byKey.get(row.priority_key) ?? { mentions: 0, top1: 0, rankSum: 0 };
    current.mentions += count;
    current.rankSum += rank * count;
    if (rank === 1) {
      current.top1 += count;
      respondents += count;
    }
    byKey.set(row.priority_key, current);
  }

  const items = [...byKey.entries()]
    .map(([priority, value]) => ({
      key: priority,
      label: MATRICULATION_PRIORITY_LABELS[priority as MatriculationPriority],
      mentions: value.mentions,
      top1: value.top1,
      avgRank: Math.round((value.rankSum / value.mentions) * 10) / 10,
    }))
    .sort((a, b) => b.mentions - a.mentions || b.top1 - a.top1 || a.avgRank - b.avgRank);

  return { respondents, items };
}

/** "O que pesa na matrícula": prioridades extraídas pelo secretário virtual, opcionalmente por curso. */
export async function priorities(req: Request, query: PrioritiesQuery) {
  const { user, supabase } = requireUser(req);
  const key = `priorities:${user.tenantId}:${JSON.stringify(query)}`;
  return cached(key, async () => {
    let q = supabase.from('vw_candidate_priorities').select('priority_key, rank, candidates').eq('tenant_id', user.tenantId);
    if (query.courseId) q = q.eq('course_id', query.courseId);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return aggregatePriorities((data ?? []) as PriorityRow[]);
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
