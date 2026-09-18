import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as calendarService from './calendar.service.js';

export const listEvents = asyncHandler(async (req: Request, res: Response) => {
  res.json(await calendarService.listEvents(req, req.query as never));
});

export const getAgenda = asyncHandler(async (req: Request, res: Response) => {
  res.json(await calendarService.getAgenda(req, req.params.profileId!, req.query as never));
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const csv = await calendarService.exportCsv(req, req.query as never);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="agenda.csv"');
  res.send(csv);
});

export const getIcs = asyncHandler(async (req: Request, res: Response) => {
  const ics = await calendarService.getEventIcs(req, req.params.id!);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${req.params.id}.ics"`);
  res.send(ics);
});
