import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as coursesController from './courses.controller.js';
import {
  courseIdParamsSchema,
  createCourseSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from './courses.schemas.js';

export const coursesRouter = Router();

coursesRouter.get('/', validate({ query: listCoursesQuerySchema }), coursesController.list);

coursesRouter.post(
  '/',
  requireRole('admin'),
  validate({ body: createCourseSchema }),
  coursesController.create,
);

coursesRouter.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: courseIdParamsSchema, body: updateCourseSchema }),
  coursesController.patch,
);

coursesRouter.delete(
  '/:id',
  requireRole('admin'),
  validate({ params: courseIdParamsSchema }),
  coursesController.remove,
);
