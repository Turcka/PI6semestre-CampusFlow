import {
  COMMUNICATION_TRIGGERS,
  MESSAGE_CHANNELS,
  messageTemplateSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@campusflow/shared';
import { z } from 'zod';

export const createTemplateSchema = messageTemplateSchema;
export const updateTemplateSchema = messageTemplateSchema.partial();
export const templateIdParamsSchema = z.object({ id: uuidSchema });

export const previewTemplateSchema = z.object({
  vars: z.record(z.union([z.string(), z.number(), z.null()])).optional(),
});

export const putRulesSchema = z.object({
  rules: z.array(
    z.object({
      trigger: z.enum(COMMUNICATION_TRIGGERS),
      channel: z.enum(MESSAGE_CHANNELS),
      templateId: uuidSchema,
      offsetMinutes: z.number().int().default(0),
      audience: z.enum(['candidate', 'coordinator', 'both']).default('candidate'),
      isActive: z.boolean().default(true),
    }),
  ),
});

export const createCampaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  channel: z.enum(MESSAGE_CHANNELS),
  templateId: uuidSchema,
  segment: z.record(z.unknown()).default({}),
  scheduledAt: z.string().datetime().optional(),
});

export const listLogsQuerySchema = paginationQuerySchema.extend({
  channel: z.enum(MESSAGE_CHANNELS).optional(),
  status: z.string().optional(),
  leadId: uuidSchema.optional(),
  campaignId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
