import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as promotersController from './promoters.controller.js';
import {
  listMyVisitsQuerySchema,
  listPromotersQuerySchema,
  promoterIdParamsSchema,
  updatePromoterProfileSchema,
} from './promoters.schemas.js';

export const promotersRouter = Router();

promotersRouter.get('/', requireRole('admin'), validate({ query: listPromotersQuerySchema }), promotersController.list);
promotersRouter.get('/me/visits', requireRole('promotor'), validate({ query: listMyVisitsQuerySchema }), promotersController.myVisits);
promotersRouter.get('/me/history', requireRole('promotor'), promotersController.myHistory);
promotersRouter.put('/me/profile', requireRole('promotor', 'admin'), validate({ body: updatePromoterProfileSchema }), promotersController.updateMe);
promotersRouter.get('/:id', requireRole('admin', 'promotor'), validate({ params: promoterIdParamsSchema }), promotersController.getById);
