import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as usersController from './users.controller.js';
import { listUsersQuerySchema, updateUserSchema, userIdParamsSchema } from './users.schemas.js';

export const usersRouter = Router();

usersRouter.get(
  '/',
  requireRole('admin', 'secretaria'),
  validate({ query: listUsersQuerySchema }),
  usersController.list,
);

usersRouter.patch(
  '/:id',
  requireRole('admin', 'secretaria'),
  validate({ params: userIdParamsSchema, body: updateUserSchema }),
  usersController.patch,
);
