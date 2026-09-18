import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as matchService from './match.service.js';

export const listWeights = asyncHandler(async (req: Request, res: Response) => {
  res.json(await matchService.listWeights(req));
});

export const putWeights = asyncHandler(async (req: Request, res: Response) => {
  res.json(await matchService.putWeights(req, req.body));
});

export const preview = asyncHandler(async (req: Request, res: Response) => {
  res.json(await matchService.previewMatch(req, req.body));
});

export const getRun = asyncHandler(async (req: Request, res: Response) => {
  res.json(await matchService.getMatchRun(req, req.params.id!));
});

export const assignVisit = asyncHandler(async (req: Request, res: Response) => {
  res.json(await matchService.assignVisitManually(req, req.params.id!, req.body));
});
