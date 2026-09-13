import { inviteUserSchema } from '@campusflow/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { enforcePlanLimits } from '../../middlewares/plan-limits.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as authController from './auth.controller.js';

export const authRouter = Router();

authRouter.get('/me', authController.getMe);

function enforceCoordinatorLimitIfNeeded(req: Request, res: Response, next: NextFunction) {
  if (req.body?.role === 'coordenador') {
    void enforcePlanLimits('coordinator')(req, res, next);
    return;
  }
  next();
}

authRouter.post(
  '/invite',
  requireRole('admin', 'secretaria'),
  validate({ body: inviteUserSchema }),
  enforceCoordinatorLimitIfNeeded,
  authController.invite,
);
