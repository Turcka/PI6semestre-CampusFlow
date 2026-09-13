import { USER_ROLES, paginationQuerySchema, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(USER_ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  q: z.string().trim().max(100).optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  courseIds: z.array(uuidSchema).optional(),
  fullName: z.string().trim().min(3).max(120).optional(),
});

export const userIdParamsSchema = z.object({ id: uuidSchema });
