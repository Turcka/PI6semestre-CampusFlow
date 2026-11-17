import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as tenantsService from './tenants.service.js';

export const getCurrent = asyncHandler(async (req: Request, res: Response) => {
  res.json(await tenantsService.getCurrentTenant(req));
});

export const patchCurrent = asyncHandler(async (req: Request, res: Response) => {
  res.json(await tenantsService.updateCurrentTenant(req, req.body));
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await tenantsService.getAssistantSettings(req));
});

export const patchSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await tenantsService.updateAssistantSettings(req, req.body));
});

export const listCampuses = asyncHandler(async (req: Request, res: Response) => {
  res.json(await tenantsService.listCampuses(req));
});

export const createCampus = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await tenantsService.createCampus(req, req.body));
});

export const patchCampus = asyncHandler(async (req: Request, res: Response) => {
  res.json(await tenantsService.updateCampus(req, req.params.id!, req.body));
});
