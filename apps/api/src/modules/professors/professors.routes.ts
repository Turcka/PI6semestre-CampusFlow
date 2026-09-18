import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as professorsController from './professors.controller.js';
import {
  professorRequirementRuleSchema,
  requirementRuleIdParamsSchema,
  updateProfessorProfileSchema,
} from './professors.schemas.js';

export const professorsRouter = Router();

professorsRouter.put(
  '/me/profile',
  requireRole('professor'),
  validate({ body: updateProfessorProfileSchema }),
  professorsController.updateMe,
);
professorsRouter.get('/me/requests', requireRole('professor'), professorsController.myRequests);
professorsRouter.get('/me/visits', requireRole('professor'), professorsController.myVisits);

professorsRouter.get('/requirement-rules', requireRole('admin'), professorsController.listRules);
professorsRouter.post(
  '/requirement-rules',
  requireRole('admin'),
  validate({ body: professorRequirementRuleSchema }),
  professorsController.createRule,
);
professorsRouter.patch(
  '/requirement-rules/:id',
  requireRole('admin'),
  validate({ params: requirementRuleIdParamsSchema, body: professorRequirementRuleSchema.partial() }),
  professorsController.updateRule,
);
professorsRouter.delete(
  '/requirement-rules/:id',
  requireRole('admin'),
  validate({ params: requirementRuleIdParamsSchema }),
  professorsController.deleteRule,
);
