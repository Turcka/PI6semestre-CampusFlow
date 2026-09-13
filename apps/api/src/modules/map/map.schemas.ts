import { POI_CATEGORIES, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

const geoJsonLineString = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const createPoiSchema = z.object({
  campusId: uuidSchema,
  name: z.string().trim().min(2).max(120),
  category: z.enum(POI_CATEGORIES).default('outro'),
  description: z.string().trim().max(2000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  building: z.string().trim().max(80).optional(),
  floor: z.string().trim().max(40).optional(),
  isAccessible: z.boolean().optional(),
  orderIndex: z.number().int().optional(),
});

export const updatePoiSchema = createPoiSchema.partial().omit({ campusId: true });
export const poiIdParamsSchema = z.object({ id: uuidSchema });

export const createRouteSchema = z.object({
  campusId: uuidSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  isAccessible: z.boolean().optional(),
  geometry: geoJsonLineString.optional(),
  distanceMeters: z.number().int().optional(),
  durationMinutes: z.number().int().optional(),
  points: z
    .array(
      z.object({
        poiId: uuidSchema,
        orderIndex: z.number().int().min(0),
        dwellMinutes: z.number().int().min(1).default(10),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .optional(),
});

export const updateRouteSchema = createRouteSchema.partial().omit({ campusId: true });
export const routeIdParamsSchema = z.object({ id: uuidSchema });

export const createItinerarySchema = z.object({
  courseId: uuidSchema,
  routeId: uuidSchema,
  description: z.string().trim().max(2000).optional(),
});

export const updateItinerarySchema = createItinerarySchema.partial();
export const itineraryIdParamsSchema = z.object({ id: uuidSchema });

export const publicMapParamsSchema = z.object({
  campusId: z.string().min(1),
});
