import type { Request } from 'express';

import { AppError } from '../../utils/app-error.js';
import type { createCampusSchema, updateCampusSchema, updateTenantSchema } from './tenants.schemas.js';
import type { z } from 'zod';

type UpdateTenant = z.infer<typeof updateTenantSchema>;
type CreateCampus = z.infer<typeof createCampusSchema>;
type UpdateCampus = z.infer<typeof updateCampusSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function getCurrentTenant(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, slug, timezone, logo_url, settings, is_active, created_at, updated_at')
    .eq('id', user.tenantId)
    .single();
  if (error || !data) throw AppError.notFound('Tenant não encontrado.');
  return data;
}

export async function updateCurrentTenant(req: Request, input: UpdateTenant) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
  if (input.settings !== undefined) patch.settings = input.settings;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase.from('tenants').update(patch).eq('id', user.tenantId).select().single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function listCampuses(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('campuses')
    .select('*')
    .eq('tenant_id', user.tenantId)
    .order('name');
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createCampus(req: Request, input: CreateCampus) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('campuses')
    .insert({
      tenant_id: user.tenantId,
      name: input.name,
      slug: input.slug,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      map_bounds: input.mapBounds ?? null,
      is_active: input.isActive ?? true,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updateCampus(req: Request, campusId: string, input: UpdateCampus) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.address !== undefined) patch.address = input.address;
  if (input.city !== undefined) patch.city = input.city;
  if (input.state !== undefined) patch.state = input.state;
  if (input.latitude !== undefined) patch.latitude = input.latitude;
  if (input.longitude !== undefined) patch.longitude = input.longitude;
  if (input.mapBounds !== undefined) patch.map_bounds = input.mapBounds;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase
    .from('campuses')
    .update(patch)
    .eq('id', campusId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Campus não encontrado.');
  return data;
}
