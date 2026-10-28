import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as usersService from './users.service.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await usersService.listUsers(req, req.query as never));
});

export const patch = asyncHandler(async (req: Request, res: Response) => {
  res.json(await usersService.updateUser(req, req.params.id!, req.body));
});

export const ban = asyncHandler(async (req: Request, res: Response) => {
  res.json(await usersService.banUser(req, req.params.id!, req.body));
});

export const unban = asyncHandler(async (req: Request, res: Response) => {
  res.json(await usersService.unbanUser(req, req.params.id!));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  res.json(await usersService.removeUser(req, req.params.id!));
});
