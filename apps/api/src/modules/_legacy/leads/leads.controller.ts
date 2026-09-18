import type { Request, Response } from 'express';

import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as leadsService from './leads.service.js';

export const importPreview = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw AppError.badRequest('Arquivo obrigatório.');
  res.status(201).json(await leadsService.importLeadsPreview(req, file));
});

export const confirmImport = asyncHandler(async (req: Request, res: Response) => {
  res.json(await leadsService.confirmImport(req, req.params.importId!));
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await leadsService.listLeads(req, req.query as never));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json(await leadsService.getLead(req, req.params.id!));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await leadsService.createLead(req, req.body));
});

export const patch = asyncHandler(async (req: Request, res: Response) => {
  res.json(await leadsService.updateLead(req, req.params.id!, req.body));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await leadsService.deleteLead(req, req.params.id!);
  res.status(204).send();
});

export const exportXlsx = asyncHandler(async (req: Request, res: Response) => {
  await leadsService.exportLeadsXlsx(req, res, req.query as never);
});

export const createPublic = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await leadsService.createPublicLead(req.body));
});
