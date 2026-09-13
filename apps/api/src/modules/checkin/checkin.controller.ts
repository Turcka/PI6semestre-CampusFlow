import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as checkinService from './checkin.service.js';

export const scan = asyncHandler(async (req: Request, res: Response) => {
  res.json(await checkinService.scanCheckin(req, req.body));
});

export const qrPng = asyncHandler(async (req: Request, res: Response) => {
  const buffer = await checkinService.getCheckinQrPng(req.params.token!);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(buffer);
});
