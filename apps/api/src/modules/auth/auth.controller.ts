import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as authService from './auth.service.js';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await authService.getMe(req));
});

export const invite = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.inviteUser(req, req.body);
  res.status(201).json(result);
});
