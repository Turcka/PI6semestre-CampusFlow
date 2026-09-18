import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as billingService from './billing.service.js';

export const usage = asyncHandler(async (req: Request, res: Response) => {
  res.json(await billingService.getUsage(req));
});

export const plan = asyncHandler(async (req: Request, res: Response) => {
  res.json(await billingService.getPlan(req));
});
