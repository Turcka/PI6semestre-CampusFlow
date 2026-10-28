import { USER_ROLES, birthDateSchema, paginationQuerySchema, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

const boolQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(USER_ROLES).optional(),
  isActive: boolQuery,
  /** `true` devolve só quem pode ser escalado (ativo e não banido) e inclui `eligible` para promotores. */
  assignable: boolQuery,
  includeBanned: boolQuery,
  q: z.string().trim().max(100).optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  courseIds: z.array(uuidSchema).optional(),
  fullName: z.string().trim().min(3).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  birthDate: birthDateSchema.nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const banUserSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const userIdParamsSchema = z.object({ id: uuidSchema });
