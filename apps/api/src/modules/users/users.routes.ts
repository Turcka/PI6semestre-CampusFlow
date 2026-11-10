import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as usersController from './users.controller.js';
import { banUserSchema, listUsersQuerySchema, updateUserSchema, userIdParamsSchema } from './users.schemas.js';

export const usersRouter = Router();

const adminOnly = requireRole('admin');

usersRouter.get('/', adminOnly, validate({ query: listUsersQuerySchema }), usersController.list);
usersRouter.patch('/:id', adminOnly, validate({ params: userIdParamsSchema, body: updateUserSchema }), usersController.patch);

// Moderação (E4): banir mantém histórico e bloqueia login; expulsar remove a conta.
usersRouter.post('/:id/ban', adminOnly, validate({ params: userIdParamsSchema, body: banUserSchema }), usersController.ban);
usersRouter.post('/:id/unban', adminOnly, validate({ params: userIdParamsSchema }), usersController.unban);
usersRouter.delete('/:id', adminOnly, validate({ params: userIdParamsSchema }), usersController.remove);
