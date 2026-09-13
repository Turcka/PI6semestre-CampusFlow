import { createVisitSchema } from '@campusflow/shared';
import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as schedulingController from './scheduling.controller.js';
import {
  cancelVisitSchema,
  generateSlotsSchema,
  listVisitsQuerySchema,
  publicSlotsQuerySchema,
  rescheduleVisitSchema,
  visitIdParamsSchema,
} from './scheduling.schemas.js';

export const schedulingRouter = Router();

schedulingRouter.post(
  '/slots/generate',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ body: generateSlotsSchema }),
  schedulingController.generateSlots,
);

schedulingRouter.get(
  '/visits',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ query: listVisitsQuerySchema }),
  schedulingController.listVisits,
);

schedulingRouter.patch(
  '/visits/:id/cancel',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ params: visitIdParamsSchema, body: cancelVisitSchema }),
  schedulingController.cancelVisit,
);

schedulingRouter.post(
  '/visits/:id/reschedule',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ params: visitIdParamsSchema, body: rescheduleVisitSchema }),
  schedulingController.rescheduleVisit,
);

export const publicSchedulingRouter = Router();

publicSchedulingRouter.get(
  '/slots',
  validate({ query: publicSlotsQuerySchema }),
  schedulingController.listPublicSlots,
);

publicSchedulingRouter.post(
  '/visits',
  validate({ body: createVisitSchema }),
  schedulingController.createPublicVisit,
);
