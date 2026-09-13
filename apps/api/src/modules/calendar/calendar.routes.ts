import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as calendarController from './calendar.controller.js';
import { declineEventSchema, eventIdParamsSchema, listEventsQuerySchema } from './calendar.schemas.js';

export const calendarRouter = Router();

calendarRouter.get(
  '/events',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ query: listEventsQuerySchema }),
  calendarController.listEvents,
);

calendarRouter.post(
  '/events/:id/confirm',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ params: eventIdParamsSchema }),
  calendarController.confirmEvent,
);

calendarRouter.post(
  '/events/:id/decline',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ params: eventIdParamsSchema, body: declineEventSchema }),
  calendarController.declineEvent,
);

calendarRouter.get(
  '/events/:id/ics',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ params: eventIdParamsSchema }),
  calendarController.getIcs,
);
