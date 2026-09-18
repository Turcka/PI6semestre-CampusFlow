import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as analyticsService from './analytics.service.js';

export const overview = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.overview(req, req.query as never));
});

export const visitsByCourse = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.visitsByCourse(req, req.query as never));
});

export const visitsByPromoter = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.visitsByPromoter(req, req.query as never));
});

export const occupancy = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.occupancy(req, req.query as never));
});

export const reassignments = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.reassignments(req, req.query as never));
});

export const promoters = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.promoters(req, req.query as never));
});

export const conversion = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.conversion(req, req.query as never));
});

export const timeseries = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.timeseries(req, req.query as never));
});
