import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as onboardingService from './onboarding.service.js';
import * as promotersService from './promoters.service.js';

export const onboardingStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json(await onboardingService.status(req));
});

export const onboardingStart = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await onboardingService.startSession(req));
});

export const onboardingNext = asyncHandler(async (req: Request, res: Response) => {
  res.json(await onboardingService.nextQuestion(req, req.params.id!));
});

export const onboardingAnswer = asyncHandler(async (req: Request, res: Response) => {
  res.json(await onboardingService.answer(req, req.params.id!, req.body));
});

export const onboardingReview = asyncHandler(async (req: Request, res: Response) => {
  res.json(await onboardingService.review(req, req.params.id!));
});

export const onboardingComplete = asyncHandler(async (req: Request, res: Response) => {
  res.json(await onboardingService.complete(req, req.params.id!));
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.listPromoters(req, req.query as never));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.getPromoter(req, req.params.id!));
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.updateMyProfile(req, req.body));
});

export const myVisits = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.listMyVisits(req, req.query as never));
});

export const myHistory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await promotersService.getMyHistory(req));
});
