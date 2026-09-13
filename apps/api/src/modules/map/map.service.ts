import { createHash } from 'node:crypto';

import type { Request } from 'express';
import type { z } from 'zod';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import type {
  createItinerarySchema,
  createPoiSchema,
  createRouteSchema,
  updateItinerarySchema,
  updatePoiSchema,
  updateRouteSchema,
} from './map.schemas.js';

type CreatePoi = z.infer<typeof createPoiSchema>;
type UpdatePoi = z.infer<typeof updatePoiSchema>;
type CreateRoute = z.infer<typeof createRouteSchema>;
type UpdateRoute = z.infer<typeof updateRouteSchema>;
type CreateItinerary = z.infer<typeof createItinerarySchema>;
type UpdateItinerary = z.infer<typeof updateItinerarySchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listPois(req: Request, campusId?: string) {
  const { user, supabase } = requireUser(req);
  let q = supabase.from('pois').select('*, poi_photos(*)').eq('tenant_id', user.tenantId).order('order_index');
  if (campusId) q = q.eq('campus_id', campusId);
  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createPoi(req: Request, input: CreatePoi) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('pois')
    .insert({
      tenant_id: user.tenantId,
      campus_id: input.campusId,
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      building: input.building ?? null,
      floor: input.floor ?? null,
      is_accessible: input.isAccessible ?? true,
      order_index: input.orderIndex ?? 0,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updatePoi(req: Request, poiId: string, input: UpdatePoi) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) patch.description = input.description;
  if (input.latitude !== undefined) patch.latitude = input.latitude;
  if (input.longitude !== undefined) patch.longitude = input.longitude;
  if (input.building !== undefined) patch.building = input.building;
  if (input.floor !== undefined) patch.floor = input.floor;
  if (input.isAccessible !== undefined) patch.is_accessible = input.isAccessible;
  if (input.orderIndex !== undefined) patch.order_index = input.orderIndex;

  const { data, error } = await supabase
    .from('pois')
    .update(patch)
    .eq('id', poiId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('POI não encontrado.');
  return data;
}

export async function deletePoi(req: Request, poiId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase.from('pois').delete().eq('id', poiId).eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}

export async function listRoutes(req: Request, campusId?: string) {
  const { user, supabase } = requireUser(req);
  let q = supabase.from('routes').select('*, route_points(*)').eq('tenant_id', user.tenantId).order('name');
  if (campusId) q = q.eq('campus_id', campusId);
  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createRoute(req: Request, input: CreateRoute) {
  const { user, supabase } = requireUser(req);
  const { data: route, error } = await supabase
    .from('routes')
    .insert({
      tenant_id: user.tenantId,
      campus_id: input.campusId,
      name: input.name,
      description: input.description ?? null,
      is_accessible: input.isAccessible ?? false,
      geometry: input.geometry ?? null,
      distance_meters: input.distanceMeters ?? null,
      duration_minutes: input.durationMinutes ?? null,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);

  if (input.points?.length) {
    const points = input.points.map((p) => ({
      route_id: route.id,
      poi_id: p.poiId,
      order_index: p.orderIndex,
      dwell_minutes: p.dwellMinutes,
      notes: p.notes ?? null,
    }));
    const { error: pointsError } = await supabase.from('route_points').insert(points);
    if (pointsError) throw AppError.badRequest(pointsError.message);
  }

  return route;
}

export async function updateRoute(req: Request, routeId: string, input: UpdateRoute) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.isAccessible !== undefined) patch.is_accessible = input.isAccessible;
  if (input.geometry !== undefined) patch.geometry = input.geometry;
  if (input.distanceMeters !== undefined) patch.distance_meters = input.distanceMeters;
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;

  const { data, error } = await supabase
    .from('routes')
    .update(patch)
    .eq('id', routeId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Rota não encontrada.');

  if (input.points) {
    await supabase.from('route_points').delete().eq('route_id', routeId);
    if (input.points.length) {
      const points = input.points.map((p) => ({
        route_id: routeId,
        poi_id: p.poiId,
        order_index: p.orderIndex,
        dwell_minutes: p.dwellMinutes,
        notes: p.notes ?? null,
      }));
      const { error: pointsError } = await supabase.from('route_points').insert(points);
      if (pointsError) throw AppError.badRequest(pointsError.message);
    }
  }

  return data;
}

export async function deleteRoute(req: Request, routeId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase.from('routes').delete().eq('id', routeId).eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}

export async function listItineraries(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('itineraries')
    .select('*, courses(name), routes(name)')
    .eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createItinerary(req: Request, input: CreateItinerary) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('itineraries')
    .insert({
      tenant_id: user.tenantId,
      course_id: input.courseId,
      route_id: input.routeId,
      description: input.description ?? null,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updateItinerary(req: Request, itineraryId: string, input: UpdateItinerary) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.courseId !== undefined) patch.course_id = input.courseId;
  if (input.routeId !== undefined) patch.route_id = input.routeId;
  if (input.description !== undefined) patch.description = input.description;

  const { data, error } = await supabase
    .from('itineraries')
    .update(patch)
    .eq('id', itineraryId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Roteiro não encontrado.');
  return data;
}

export async function deleteItinerary(req: Request, itineraryId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase.from('itineraries').delete().eq('id', itineraryId).eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}

export async function getPublicMap(campusIdOrSlug: string) {
  const admin = getAdminClient();
  const isUuid = /^[0-9a-f-]{36}$/i.test(campusIdOrSlug);

  let query = admin.from('vw_public_campus_map').select('*');
  query = isUuid ? query.eq('campus_id', campusIdOrSlug) : query.eq('slug', campusIdOrSlug);

  const { data, error } = await query.maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Mapa do campus não encontrado.');

  const payload = JSON.stringify(data);
  const etag = `"${createHash('sha1').update(payload).digest('hex')}"`;
  return { data, etag };
}
