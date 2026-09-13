import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as checkinController from './checkin.controller.js';
import { checkinTokenParamsSchema, scanCheckinSchema } from './checkin.schemas.js';

export const checkinRouter = Router();

checkinRouter.post(
  '/scan',
  requireRole('admin', 'secretaria', 'embaixador', 'coordenador'),
  validate({ body: scanCheckinSchema }),
  checkinController.scan,
);

export const publicCheckinRouter = Router();
publicCheckinRouter.get(
  '/:token/qr.png',
  validate({ params: checkinTokenParamsSchema }),
  checkinController.qrPng,
);
