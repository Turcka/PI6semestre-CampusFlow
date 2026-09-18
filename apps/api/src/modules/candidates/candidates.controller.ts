import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as candidatesService from './candidates.service.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await candidatesService.listCandidates(req, req.query as never));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json(await candidatesService.getCandidate(req, req.params.id!));
});

export const patch = asyncHandler(async (req: Request, res: Response) => {
  res.json(await candidatesService.updateCandidate(req, req.params.id!, req.body));
});

export const createPublic = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await candidatesService.createPublicCandidate(req.body));
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await candidatesService.getPublicMe(String(req.query.token)));
});

export const patchMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await candidatesService.updatePublicMe(String(req.query.token), req.body));
});

export const listMeVisits = asyncHandler(async (req: Request, res: Response) => {
  res.json(await candidatesService.listPublicVisits(String(req.query.token)));
});
