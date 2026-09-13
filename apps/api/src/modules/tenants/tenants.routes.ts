import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as tenantsController from './tenants.controller.js';
import {
  campusIdParamsSchema,
  createCampusSchema,
  updateCampusSchema,
  updateTenantSchema,
} from './tenants.schemas.js';

export const tenantsRouter = Router();

tenantsRouter.get('/current', tenantsController.getCurrent);
tenantsRouter.patch(
  '/current',
  requireRole('admin'),
  validate({ body: updateTenantSchema }),
  tenantsController.patchCurrent,
);

tenantsRouter.get('/current/campuses', tenantsController.listCampuses);
tenantsRouter.post(
  '/current/campuses',
  requireRole('admin', 'secretaria'),
  validate({ body: createCampusSchema }),
  tenantsController.createCampus,
);
tenantsRouter.patch(
  '/current/campuses/:id',
  requireRole('admin', 'secretaria'),
  validate({ params: campusIdParamsSchema, body: updateCampusSchema }),
  tenantsController.patchCampus,
);
