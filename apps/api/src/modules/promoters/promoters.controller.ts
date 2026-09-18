import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as promotersService from './promoters.service.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.listPromoters(req, req.query as never));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.getPromoter(req, req.params.id!));
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.updateMyProfile(req, req.body));
});

export const myVisits = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.listMyVisits(req, req.query as never));
});

export const myHistory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.getMyHistory(req));
});
