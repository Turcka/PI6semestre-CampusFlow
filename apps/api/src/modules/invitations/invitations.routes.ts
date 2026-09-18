import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as invitationsController from './invitations.controller.js';
import {
  declineInvitationSchema,
  invitationIdParamsSchema,
  listInvitationsQuerySchema,
} from './invitations.schemas.js';

export const invitationsRouter = Router();
const participants = requireRole('admin', 'promotor', 'professor');

invitationsRouter.get('/me', participants, validate({ query: listInvitationsQuerySchema }), invitationsController.listMe);
invitationsRouter.post(
  '/:id/accept',
  participants,
  validate({ params: invitationIdParamsSchema }),
  invitationsController.accept,
);
invitationsRouter.post(
  '/:id/decline',
  participants,
  validate({ params: invitationIdParamsSchema, body: declineInvitationSchema }),
  invitationsController.decline,
);
