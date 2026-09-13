import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as analyticsService from './analytics.service.js';

export const overview = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.getOverview(req, req.query as never));
});

export const funnel = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.getFunnel(req, req.query as never));
});

export const leadsBySource = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.getLeadsBySource(req, req.query as never));
});

export const leadsByCourse = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.getLeadsByCourse(req, req.query as never));
});

export const messaging = asyncHandler(async (req: Request, res: Response) => {
  res.json(await analyticsService.getMessagingMetrics(req, req.query as never));
});
