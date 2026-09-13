import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as usersService from './users.service.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await usersService.listUsers(req, req.query as never));
});

export const patch = asyncHandler(async (req: Request, res: Response) => {
  res.json(await usersService.updateUser(req, req.params.id!, req.body));
});
