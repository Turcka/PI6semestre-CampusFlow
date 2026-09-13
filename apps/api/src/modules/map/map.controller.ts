import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as mapService from './map.service.js';

export const listPois = asyncHandler(async (req: Request, res: Response) => {
  res.json(await mapService.listPois(req, typeof req.query.campusId === 'string' ? req.query.campusId : undefined));
});

export const createPoi = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await mapService.createPoi(req, req.body));
});

export const updatePoi = asyncHandler(async (req: Request, res: Response) => {
  res.json(await mapService.updatePoi(req, req.params.id!, req.body));
});

export const deletePoi = asyncHandler(async (req: Request, res: Response) => {
  await mapService.deletePoi(req, req.params.id!);
  res.status(204).send();
});

export const listRoutes = asyncHandler(async (req: Request, res: Response) => {
  res.json(await mapService.listRoutes(req, typeof req.query.campusId === 'string' ? req.query.campusId : undefined));
});

export const createRoute = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await mapService.createRoute(req, req.body));
});

export const updateRoute = asyncHandler(async (req: Request, res: Response) => {
  res.json(await mapService.updateRoute(req, req.params.id!, req.body));
});

export const deleteRoute = asyncHandler(async (req: Request, res: Response) => {
  await mapService.deleteRoute(req, req.params.id!);
  res.status(204).send();
});

export const listItineraries = asyncHandler(async (req: Request, res: Response) => {
  res.json(await mapService.listItineraries(req));
});

export const createItinerary = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await mapService.createItinerary(req, req.body));
});

export const updateItinerary = asyncHandler(async (req: Request, res: Response) => {
  res.json(await mapService.updateItinerary(req, req.params.id!, req.body));
});

export const deleteItinerary = asyncHandler(async (req: Request, res: Response) => {
  await mapService.deleteItinerary(req, req.params.id!);
  res.status(204).send();
});

export const getPublicMap = asyncHandler(async (req: Request, res: Response) => {
  const { data, etag } = await mapService.getPublicMap(req.params.campusId!);
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('ETag', etag);
  res.json(data);
});
