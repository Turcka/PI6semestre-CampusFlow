import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as matchController from './match.controller.js';
import { assignVisitSchema, previewMatchSchema, putWeightsSchema, runIdParamsSchema } from './match.schemas.js';

export const matchRouter = Router();
const adminOnly = requireRole('admin');

matchRouter.get('/weights', adminOnly, matchController.listWeights);
matchRouter.put('/weights', adminOnly, validate({ body: putWeightsSchema }), matchController.putWeights);
matchRouter.post('/preview', adminOnly, validate({ body: previewMatchSchema }), matchController.preview);
matchRouter.get('/runs/:id', adminOnly, validate({ params: runIdParamsSchema }), matchController.getRun);
