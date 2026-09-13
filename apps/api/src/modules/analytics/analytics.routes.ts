import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as analyticsController from './analytics.controller.js';
import { analyticsRangeQuerySchema } from './analytics.schemas.js';

export const analyticsRouter = Router();

const viewers = requireRole('admin', 'secretaria', 'marketing', 'coordenador');

analyticsRouter.get('/overview', viewers, validate({ query: analyticsRangeQuerySchema }), analyticsController.overview);
analyticsRouter.get('/funnel', viewers, validate({ query: analyticsRangeQuerySchema }), analyticsController.funnel);
analyticsRouter.get(
  '/leads-by-source',
  viewers,
  validate({ query: analyticsRangeQuerySchema }),
  analyticsController.leadsBySource,
);
analyticsRouter.get(
  '/leads-by-course',
  viewers,
  validate({ query: analyticsRangeQuerySchema }),
  analyticsController.leadsByCourse,
);
analyticsRouter.get('/messaging', viewers, validate({ query: analyticsRangeQuerySchema }), analyticsController.messaging);
