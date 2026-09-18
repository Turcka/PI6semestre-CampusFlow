import { inviteUserSchema } from '@campusflow/shared';
import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as authController from './auth.controller.js';

export const authRouter = Router();

authRouter.get('/me', authController.getMe);
authRouter.post('/invite', requireRole('admin'), validate({ body: inviteUserSchema }), authController.invite);
