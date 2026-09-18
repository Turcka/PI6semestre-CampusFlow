import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as professorsService from './professors.service.js';

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await professorsService.updateMyProfile(req, req.body));
});

export const myRequests = asyncHandler(async (req: Request, res: Response) => {
  res.json(await professorsService.listMyRequests(req));
});

export const myVisits = asyncHandler(async (req: Request, res: Response) => {
  res.json(await professorsService.listMyVisits(req));
});

export const listRules = asyncHandler(async (req: Request, res: Response) => {
  res.json(await professorsService.listRequirementRules(req));
});

export const createRule = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await professorsService.createRequirementRule(req, req.body));
});

export const updateRule = asyncHandler(async (req: Request, res: Response) => {
  res.json(await professorsService.updateRequirementRule(req, req.params.id!, req.body));
});

export const deleteRule = asyncHandler(async (req: Request, res: Response) => {
  await professorsService.deleteRequirementRule(req, req.params.id!);
  res.status(204).send();
});
