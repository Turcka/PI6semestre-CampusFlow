import { Router } from 'express';
import multer from 'multer';

import { enforcePlanLimits } from '../../middlewares/plan-limits.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as leadsController from './leads.controller.js';
import {
  createLeadSchema,
  importIdParamsSchema,
  leadIdParamsSchema,
  listLeadsQuerySchema,
  publicLeadSchema,
  updateLeadSchema,
} from './leads.schemas.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

export const leadsRouter = Router();

leadsRouter.post(
  '/import',
  requireRole('admin', 'secretaria', 'marketing'),
  upload.single('file'),
  leadsController.importPreview,
);

leadsRouter.post(
  '/import/:importId/confirm',
  requireRole('admin', 'secretaria', 'marketing'),
  validate({ params: importIdParamsSchema }),
  enforcePlanLimits('leads'),
  leadsController.confirmImport,
);

leadsRouter.get('/export.xlsx', validate({ query: listLeadsQuerySchema }), leadsController.exportXlsx);

leadsRouter.get('/', validate({ query: listLeadsQuerySchema }), leadsController.list);

leadsRouter.post(
  '/',
  requireRole('admin', 'secretaria', 'marketing'),
  validate({ body: createLeadSchema }),
  leadsController.create,
);

leadsRouter.get('/:id', validate({ params: leadIdParamsSchema }), leadsController.getById);

leadsRouter.patch(
  '/:id',
  requireRole('admin', 'secretaria', 'marketing'),
  validate({ params: leadIdParamsSchema, body: updateLeadSchema }),
  leadsController.patch,
);

leadsRouter.delete(
  '/:id',
  requireRole('admin', 'secretaria'),
  validate({ params: leadIdParamsSchema }),
  leadsController.remove,
);

/** Router público montado em /api/v1/public */
export const publicLeadsRouter = Router();
publicLeadsRouter.post('/', validate({ body: publicLeadSchema }), leadsController.createPublic);
