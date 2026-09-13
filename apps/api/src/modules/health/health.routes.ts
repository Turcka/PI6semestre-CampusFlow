import { Router } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import { checkLiveness, checkReadiness } from './health.service.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await checkLiveness());
  }),
);

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    res.json(await checkReadiness());
  }),
);
