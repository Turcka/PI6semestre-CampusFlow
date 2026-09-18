import { INVITATION_STATUSES, uuidSchema } from '@campusflow/shared';
import { z } from 'zod';

export const listInvitationsQuerySchema = z.object({
  status: z.enum(INVITATION_STATUSES).optional().default('pending'),
});

export const invitationIdParamsSchema = z.object({ id: uuidSchema });

export const declineInvitationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
