import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as availabilityController from './availability.controller.js';
import {
  createExceptionSchema,
  exceptionIdParamsSchema,
  listExceptionsQuerySchema,
  listRulesQuerySchema,
  putRulesSchema,
} from './availability.schemas.js';

export const availabilityRouter = Router();
const managers = requireRole('admin', 'promotor', 'professor');

availabilityRouter.get('/rules', managers, validate({ query: listRulesQuerySchema }), availabilityController.listRules);
availabilityRouter.put('/rules', managers, validate({ body: putRulesSchema }), availabilityController.putRules);
availabilityRouter.get('/exceptions', managers, validate({ query: listExceptionsQuerySchema }), availabilityController.listExceptions);
availabilityRouter.post('/exceptions', managers, validate({ body: createExceptionSchema }), availabilityController.createException);
availabilityRouter.delete('/exceptions/:id', managers, validate({ params: exceptionIdParamsSchema }), availabilityController.deleteException);
