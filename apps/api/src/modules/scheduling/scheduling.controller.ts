import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as schedulingService from './scheduling.service.js';

export const generateSlots = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.generateSlots(req, req.body));
});

export const listVisits = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.listVisits(req, req.query as never));
});

export const cancelVisit = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.cancelVisit(req, req.params.id!, req.body));
});

export const rescheduleVisit = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await schedulingService.rescheduleVisit(req, req.params.id!, req.body));
});

export const listPublicSlots = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.listPublicSlots(req.query as never));
});

export const createPublicVisit = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await schedulingService.createPublicVisit(req.body));
});
