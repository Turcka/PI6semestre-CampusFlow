import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as messagingService from './messaging.service.js';

export const listTemplates = asyncHandler(async (req: Request, res: Response) => {
  res.json(await messagingService.listTemplates(req));
});

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await messagingService.createTemplate(req, req.body));
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  res.json(await messagingService.updateTemplate(req, req.params.id!, req.body));
});

export const deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
  await messagingService.deleteTemplate(req, req.params.id!);
  res.status(204).send();
});

export const previewTemplate = asyncHandler(async (req: Request, res: Response) => {
  res.json(await messagingService.previewTemplate(req, req.params.id!, req.body));
});

export const listRules = asyncHandler(async (req: Request, res: Response) => {
  res.json(await messagingService.listRules(req));
});

export const putRules = asyncHandler(async (req: Request, res: Response) => {
  res.json(await messagingService.replaceRules(req, req.body));
});

export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await messagingService.createCampaign(req, req.body));
});

export const listLogs = asyncHandler(async (req: Request, res: Response) => {
  res.json(await messagingService.listLogs(req, req.query as never));
});
