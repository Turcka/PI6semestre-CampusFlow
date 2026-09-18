import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as visitsService from './visits.service.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await visitsService.listVisits(req, req.query as never));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json(await visitsService.getVisit(req, req.params.id!));
});

export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json(await visitsService.setVisitStatus(req, req.params.id!, req.body));
});

export const addNote = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await visitsService.addNote(req, req.params.id!, req.body));
});

export const listNotes = asyncHandler(async (req: Request, res: Response) => {
  res.json(await visitsService.listNotes(req, req.params.id!));
});

export const briefing = asyncHandler(async (req: Request, res: Response) => {
  res.json(await visitsService.getBriefing(req, req.params.id!));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await visitsService.createManualVisit(req, req.body));
});

export const assign = asyncHandler(async (req: Request, res: Response) => {
  res.json(await visitsService.assignVisit(req, req.params.id!, req.body));
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  res.json(await visitsService.cancelVisit(req, req.params.id!, req.body));
});

export const reschedule = asyncHandler(async (req: Request, res: Response) => {
  res.json(await visitsService.rescheduleVisit(req, req.params.id!, req.body));
});
