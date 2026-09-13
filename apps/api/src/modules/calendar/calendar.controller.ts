import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as calendarService from './calendar.service.js';

export const listEvents = asyncHandler(async (req: Request, res: Response) => {
  res.json(await calendarService.listEvents(req, req.query as never));
});

export const confirmEvent = asyncHandler(async (req: Request, res: Response) => {
  res.json(await calendarService.confirmEvent(req, req.params.id!));
});

export const declineEvent = asyncHandler(async (req: Request, res: Response) => {
  res.json(await calendarService.declineEvent(req, req.params.id!, req.body));
});

export const getIcs = asyncHandler(async (req: Request, res: Response) => {
  const ics = await calendarService.getEventIcs(req, req.params.id!);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${req.params.id}.ics"`);
  res.send(ics);
});
