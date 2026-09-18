import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as visitsController from './visits.controller.js';
import {
  assignVisitSchema,
  cancelVisitSchema,
  createManualVisitSchema,
  createVisitNoteSchema,
  listVisitsQuerySchema,
  rescheduleVisitSchema,
  setVisitStatusSchema,
  visitIdParamsSchema,
} from './visits.schemas.js';

export const visitsRouter = Router();
const staff = requireRole('admin', 'promotor', 'professor');
const adminOnly = requireRole('admin');
const adminOrPromotor = requireRole('admin', 'promotor');

visitsRouter.get('/', staff, validate({ query: listVisitsQuerySchema }), visitsController.list);
visitsRouter.post('/', adminOnly, validate({ body: createManualVisitSchema }), visitsController.create);
visitsRouter.get('/:id', staff, validate({ params: visitIdParamsSchema }), visitsController.getById);
visitsRouter.patch(
  '/:id/status',
  adminOrPromotor,
  validate({ params: visitIdParamsSchema, body: setVisitStatusSchema }),
  visitsController.setStatus,
);
visitsRouter.post(
  '/:id/notes',
  adminOrPromotor,
  validate({ params: visitIdParamsSchema, body: createVisitNoteSchema }),
  visitsController.addNote,
);
visitsRouter.get('/:id/notes', staff, validate({ params: visitIdParamsSchema }), visitsController.listNotes);
visitsRouter.get('/:id/briefing', staff, validate({ params: visitIdParamsSchema }), visitsController.briefing);
visitsRouter.post(
  '/:id/assign',
  adminOnly,
  validate({ params: visitIdParamsSchema, body: assignVisitSchema }),
  visitsController.assign,
);
visitsRouter.post(
  '/:id/cancel',
  adminOnly,
  validate({ params: visitIdParamsSchema, body: cancelVisitSchema }),
  visitsController.cancel,
);
visitsRouter.post(
  '/:id/reschedule',
  adminOnly,
  validate({ params: visitIdParamsSchema, body: rescheduleVisitSchema }),
  visitsController.reschedule,
);
