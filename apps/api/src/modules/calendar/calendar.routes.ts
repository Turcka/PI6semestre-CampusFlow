import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as calendarController from './calendar.controller.js';
import {
  agendaParamsSchema,
  agendaQuerySchema,
  eventIdParamsSchema,
  listEventsQuerySchema,
} from './calendar.schemas.js';

export const calendarRouter = Router();
const viewers = requireRole('admin', 'promotor', 'professor');

calendarRouter.get('/events', viewers, validate({ query: listEventsQuerySchema }), calendarController.listEvents);
calendarRouter.get(
  '/agenda/:profileId',
  requireRole('admin'),
  validate({ params: agendaParamsSchema, query: agendaQuerySchema }),
  calendarController.getAgenda,
);
calendarRouter.get('/export.csv', requireRole('admin'), validate({ query: listEventsQuerySchema }), calendarController.exportCsv);
calendarRouter.get('/events/:id/ics', viewers, validate({ params: eventIdParamsSchema }), calendarController.getIcs);
