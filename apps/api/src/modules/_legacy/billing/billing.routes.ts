import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import * as billingController from './billing.controller.js';

export const billingRouter = Router();

billingRouter.get('/usage', requireRole('admin', 'secretaria'), billingController.usage);
billingRouter.get('/plan', requireRole('admin', 'secretaria'), billingController.plan);
