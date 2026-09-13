import { z } from 'zod';

import { uuidSchema } from '@campusflow/shared';

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().min(3).max(60).optional(),
  logoUrl: z.string().url().nullable().optional(),
  settings: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const createCampusSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(2).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  mapBounds: z.record(z.number()).optional(),
  isActive: z.boolean().optional(),
});

export const updateCampusSchema = createCampusSchema.partial();

export const campusIdParamsSchema = z.object({ id: uuidSchema });
