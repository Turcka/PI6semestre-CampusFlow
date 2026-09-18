import { uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const scanCheckinSchema = z.object({
  token: uuidSchema,
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

export const checkinTokenParamsSchema = z.object({
  token: uuidSchema,
});
