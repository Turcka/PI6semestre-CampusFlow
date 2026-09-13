import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import type { analyticsRangeQuerySchema } from './analytics.schemas.js';

type RangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

type CacheEntry = { expiresAt: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value as T);
  return loader().then((value) => {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  });
}

export async function getOverview(req: Request, query: RangeQuery) {
  const { user, supabase } = requireUser(req);
  const key = `overview:${user.tenantId}:${query.from ?? ''}:${query.to ?? ''}:${query.campusId ?? ''}`;

  return cached(key, async () => {
    let leadsQ = supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .is('anonymized_at', null);
    let visitsQ = supabase
      .from('visits')
      .select('id, status', { count: 'exact' })
      .eq('tenant_id', user.tenantId);

    if (query.campusId) {
      leadsQ = leadsQ.eq('campus_id', query.campusId);
      visitsQ = visitsQ.eq('campus_id', query.campusId);
    }
    if (query.from) leadsQ = leadsQ.gte('created_at', `${query.from}T00:00:00Z`);
    if (query.to) leadsQ = leadsQ.lte('created_at', `${query.to}T23:59:59Z`);

    const [leads, visits] = await Promise.all([leadsQ, visitsQ]);
    if (leads.error) throw AppError.badRequest(leads.error.message);
    if (visits.error) throw AppError.badRequest(visits.error.message);

    const visitRows = visits.data ?? [];
    return {
      leads: leads.count ?? 0,
      visits: visits.count ?? 0,
      confirmed: visitRows.filter((v) => v.status === 'confirmed').length,
      checkedIn: visitRows.filter((v) => v.status === 'checked_in').length,
      cancelled: visitRows.filter((v) => v.status === 'cancelled').length,
    };
  });
}

export async function getFunnel(req: Request, query: RangeQuery) {
  const { user, supabase } = requireUser(req);
  const key = `funnel:${user.tenantId}:${query.from ?? ''}:${query.to ?? ''}:${query.campusId ?? ''}`;

  return cached(key, async () => {
    let q = supabase.from('vw_funnel').select('*').eq('tenant_id', user.tenantId);
    if (query.campusId) q = q.eq('campus_id', query.campusId);
    if (query.from) q = q.gte('period', query.from);
    if (query.to) q = q.lte('period', query.to);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}

export async function getLeadsBySource(req: Request, query: RangeQuery) {
  const { user, supabase } = requireUser(req);
  const key = `leads-by-source:${user.tenantId}:${query.from ?? ''}:${query.to ?? ''}:${query.campusId ?? ''}`;

  return cached(key, async () => {
    let q = supabase.from('mv_leads_daily').select('source, leads').eq('tenant_id', user.tenantId);
    if (query.campusId) q = q.eq('campus_id', query.campusId);
    if (query.from) q = q.gte('day', query.from);
    if (query.to) q = q.lte('day', query.to);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);

    const agg = new Map<string, number>();
    for (const row of data ?? []) {
      agg.set(row.source, (agg.get(row.source) ?? 0) + Number(row.leads));
    }
    return [...agg.entries()].map(([source, leads]) => ({ source, leads }));
  });
}

export async function getLeadsByCourse(req: Request, query: RangeQuery) {
  const { user, supabase } = requireUser(req);
  const key = `leads-by-course:${user.tenantId}:${query.from ?? ''}:${query.to ?? ''}:${query.campusId ?? ''}`;

  return cached(key, async () => {
    let q = supabase.from('mv_leads_daily').select('course_id, leads').eq('tenant_id', user.tenantId);
    if (query.campusId) q = q.eq('campus_id', query.campusId);
    if (query.from) q = q.gte('day', query.from);
    if (query.to) q = q.lte('day', query.to);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);

    const agg = new Map<string, number>();
    for (const row of data ?? []) {
      const id = row.course_id ?? 'null';
      agg.set(id, (agg.get(id) ?? 0) + Number(row.leads));
    }
    return [...agg.entries()].map(([courseId, leads]) => ({ courseId: courseId === 'null' ? null : courseId, leads }));
  });
}

export async function getMessagingMetrics(req: Request, query: RangeQuery) {
  const { user, supabase } = requireUser(req);
  const key = `messaging:${user.tenantId}:${query.from ?? ''}:${query.to ?? ''}`;

  return cached(key, async () => {
    let q = supabase.from('vw_messaging_metrics').select('*').eq('tenant_id', user.tenantId);
    if (query.from) q = q.gte('day', query.from);
    if (query.to) q = q.lte('day', query.to);
    const { data, error } = await q;
    if (error) throw AppError.badRequest(error.message);
    return data ?? [];
  });
}
