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

availabilityRouter.get(
  '/rules',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ query: listRulesQuerySchema }),
  availabilityController.listRules,
);

availabilityRouter.put(
  '/rules',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ body: putRulesSchema }),
  availabilityController.putRules,
);

availabilityRouter.get(
  '/exceptions',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ query: listExceptionsQuerySchema }),
  availabilityController.listExceptions,
);

availabilityRouter.post(
  '/exceptions',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ body: createExceptionSchema }),
  availabilityController.createException,
);

availabilityRouter.delete(
  '/exceptions/:id',
  requireRole('admin', 'secretaria', 'coordenador'),
  validate({ params: exceptionIdParamsSchema }),
  availabilityController.deleteException,
);
