import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as analyticsController from './analytics.controller.js';
import { analyticsFilterSchema, timeseriesQuerySchema } from './analytics.schemas.js';

export const analyticsRouter = Router();
const viewers = requireRole('admin');

analyticsRouter.get('/overview', viewers, validate({ query: analyticsFilterSchema }), analyticsController.overview);
analyticsRouter.get('/visits-by-course', viewers, validate({ query: analyticsFilterSchema }), analyticsController.visitsByCourse);
analyticsRouter.get('/visits-by-promoter', viewers, validate({ query: analyticsFilterSchema }), analyticsController.visitsByPromoter);
analyticsRouter.get('/occupancy', viewers, validate({ query: analyticsFilterSchema }), analyticsController.occupancy);
analyticsRouter.get('/reassignments', viewers, validate({ query: analyticsFilterSchema }), analyticsController.reassignments);
analyticsRouter.get('/promoters', viewers, validate({ query: analyticsFilterSchema }), analyticsController.promoters);
analyticsRouter.get('/conversion', viewers, validate({ query: analyticsFilterSchema }), analyticsController.conversion);
analyticsRouter.get('/timeseries', viewers, validate({ query: timeseriesQuerySchema }), analyticsController.timeseries);
