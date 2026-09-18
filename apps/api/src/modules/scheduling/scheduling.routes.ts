import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as schedulingController from './scheduling.controller.js';
import {
  cancelVisitSchema,
  generateSlotsSchema,
  listVisitsQuerySchema,
  publicScheduleVisitSchema,
  publicWindowsQuerySchema,
  rescheduleVisitSchema,
  schedulingPolicySchema,
  visitIdParamsSchema,
} from './scheduling.schemas.js';

export const schedulingRouter = Router();
const managers = requireRole('admin', 'promotor', 'professor');
const adminOnly = requireRole('admin');

schedulingRouter.post(
  '/slots/generate',
  managers,
  validate({ body: generateSlotsSchema }),
  schedulingController.generateSlots,
);

schedulingRouter.get(
  '/visits',
  managers,
  validate({ query: listVisitsQuerySchema }),
  schedulingController.listVisits,
);

schedulingRouter.patch(
  '/visits/:id/cancel',
  adminOnly,
  validate({ params: visitIdParamsSchema, body: cancelVisitSchema }),
  schedulingController.cancelVisit,
);

schedulingRouter.post(
  '/visits/:id/reschedule',
  adminOnly,
  validate({ params: visitIdParamsSchema, body: rescheduleVisitSchema }),
  schedulingController.rescheduleVisit,
);

schedulingRouter.get('/policies', adminOnly, schedulingController.getPolicies);
schedulingRouter.put('/policies', adminOnly, validate({ body: schedulingPolicySchema }), schedulingController.putPolicy);

export const publicSchedulingRouter = Router();

publicSchedulingRouter.get(
  '/windows',
  validate({ query: publicWindowsQuerySchema }),
  schedulingController.listPublicWindows,
);

publicSchedulingRouter.post(
  '/visits',
  validate({ body: publicScheduleVisitSchema }),
  schedulingController.createPublicVisit,
);

publicSchedulingRouter.get(
  '/visits/:id',
  validate({ params: visitIdParamsSchema }),
  schedulingController.getPublicVisit,
);

publicSchedulingRouter.post(
  '/visits/:id/cancel',
  validate({ params: visitIdParamsSchema, body: cancelVisitSchema }),
  schedulingController.cancelPublicVisit,
);

publicSchedulingRouter.post(
  '/visits/:id/reschedule',
  validate({ params: visitIdParamsSchema, body: rescheduleVisitSchema }),
  schedulingController.reschedulePublicVisit,
);
