import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as conversionService from './conversion.service.js';

export const getCandidate = asyncHandler(async (req: Request, res: Response) => {
  res.json(await conversionService.getCandidateConversion(req, req.params.id!));
});

export const markEnrolled = asyncHandler(async (req: Request, res: Response) => {
  res.json(await conversionService.markEnrolled(req, req.params.id!, req.body));
});
