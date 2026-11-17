import type { Request, Response } from 'express';

import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as assistantService from './assistant/assistant.service.js';
import * as chatbotService from './chatbot.service.js';
import type { SessionExpectation } from './chatbot.session.js';

/**
 * Rotas públicas do questionário: quando o token do candidato vem, a sessão precisa ser dele.
 * Sem token o comportamento antigo é mantido (ver `optionalCandidateToken`).
 */
function candidateExpectation(req: Request): SessionExpectation | undefined {
  return req.candidateToken ? { audience: 'candidato', candidateToken: req.candidateToken } : undefined;
}

function requireToken(req: Request): string {
  if (!req.candidateToken) throw AppError.unauthorized('Token do candidato ausente.');
  return req.candidateToken;
}

export const next = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.getNextQuestion(req.params.id!, candidateExpectation(req)));
});

export const answer = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await chatbotService.saveAnswer(req.params.id!, req.body, candidateExpectation(req)));
});

export const review = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.reviewSession(req.params.id!, candidateExpectation(req)));
});

export const complete = asyncHandler(async (req: Request, res: Response) => {
  res.json(await chatbotService.completeSession(req.params.id!, req.candidateToken));
});

export const postMessage = asyncHandler(async (req: Request, res: Response) => {
  res.json(await assistantService.handleMessage(req.params.id!, requireToken(req), req.body.content));
});

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  res.json(await assistantService.listMessages(req.params.id!, requireToken(req)));
});

export const setMode = asyncHandler(async (req: Request, res: Response) => {
  res.json(await assistantService.setMode(req.params.id!, requireToken(req), req.body.mode));
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
