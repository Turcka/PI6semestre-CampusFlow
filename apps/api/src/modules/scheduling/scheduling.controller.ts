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

export const getPolicies = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.getPolicies(req));
});

export const putPolicy = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.putPolicy(req, req.body));
});

export const listPublicWindows = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.listPublicWindows(req.query as never));
});

export const createPublicVisit = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await schedulingService.createPublicVisit(req.body));
});

export const getPublicVisit = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.getPublicVisit(req.params.id!, req.query.portalToken as string | undefined));
});

export const cancelPublicVisit = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.cancelPublicVisit(req.params.id!, req.body));
});

export const reschedulePublicVisit = asyncHandler(async (req: Request, res: Response) => {
  res.json(await schedulingService.reschedulePublicVisit(req.params.id!, req.body));
});
