import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as availabilityService from './availability.service.js';

export const listRules = asyncHandler(async (req: Request, res: Response) => {
  res.json(await availabilityService.listRules(req, req.query as never));
});

export const putRules = asyncHandler(async (req: Request, res: Response) => {
  res.json(await availabilityService.replaceRules(req, req.body));
});

export const listExceptions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await availabilityService.listExceptions(req, req.query as never));
});

export const createException = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await availabilityService.createException(req, req.body));
});

export const deleteException = asyncHandler(async (req: Request, res: Response) => {
  await availabilityService.deleteException(req, req.params.id!);
  res.status(204).send();
});
