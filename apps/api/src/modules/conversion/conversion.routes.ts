import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as conversionController from './conversion.controller.js';
import { candidateIdParamsSchema, markEnrolledSchema } from './conversion.schemas.js';

export const conversionRouter = Router();
const adminOnly = requireRole('admin');

conversionRouter.get(
  '/candidates/:id',
  adminOnly,
  validate({ params: candidateIdParamsSchema }),
  conversionController.getCandidate,
);
conversionRouter.post(
  '/candidates/:id/mark-enrolled',
  adminOnly,
  validate({ params: candidateIdParamsSchema, body: markEnrolledSchema }),
  conversionController.markEnrolled,
);
