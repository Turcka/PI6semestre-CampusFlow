import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as chatbotService from './chatbot.service.js';

export const next = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.getNextQuestion(req.params.id!));
});

export const answer = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await chatbotService.saveAnswer(req.params.id!, req.body));
});

export const review = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.reviewSession(req.params.id!));
});

export const complete = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.completeSession(req.params.id!));
});

export const listQuestions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.listQuestions(req, req.query as never));
});

export const createQuestion = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await chatbotService.createQuestion(req, req.body));
});

export const updateQuestion = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.updateQuestion(req, req.params.id!, req.body));
});

export const deleteQuestion = asyncHandler(async (req: Request, res: Response) => {
  await chatbotService.deleteQuestion(req, req.params.id!);
  res.status(204).send();
});

export const reorderQuestions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.reorderQuestions(req, req.body));
});

export const listInterestCategories = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.listInterestCategories(req));
});

export const createInterestCategory = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await chatbotService.createInterestCategory(req, req.body));
});

export const updateInterestCategory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.updateInterestCategory(req, req.params.id!, req.body));
});

export const deleteInterestCategory = asyncHandler(async (req: Request, res: Response) => {
  await chatbotService.deleteInterestCategory(req, req.params.id!);
  res.status(204).send();
});
