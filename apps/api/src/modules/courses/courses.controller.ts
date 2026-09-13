import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as coursesService from './courses.service.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await coursesService.listCourses(req, req.query as never));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await coursesService.createCourse(req, req.body));
});

export const patch = asyncHandler(async (req: Request, res: Response) => {
  res.json(await coursesService.updateCourse(req, req.params.id!, req.body));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await coursesService.deleteCourse(req, req.params.id!);
  res.status(204).send();
});
