import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as messagingController from './messaging.controller.js';
import {
  createTemplateSchema,
  listLogsQuerySchema,
  previewTemplateSchema,
  putRulesSchema,
  templateIdParamsSchema,
  updateTemplateSchema,
} from './messaging.schemas.js';

export const messagingRouter = Router();

const editors = requireRole('admin');

messagingRouter.get('/templates', messagingController.listTemplates);
messagingRouter.post('/templates', editors, validate({ body: createTemplateSchema }), messagingController.createTemplate);
messagingRouter.patch(
  '/templates/:id',
  editors,
  validate({ params: templateIdParamsSchema, body: updateTemplateSchema }),
  messagingController.updateTemplate,
);
messagingRouter.delete(
  '/templates/:id',
  editors,
  validate({ params: templateIdParamsSchema }),
  messagingController.deleteTemplate,
);
messagingRouter.post(
  '/templates/:id/preview',
  validate({ params: templateIdParamsSchema, body: previewTemplateSchema }),
  messagingController.previewTemplate,
);

messagingRouter.get('/rules', messagingController.listRules);
messagingRouter.put('/rules', editors, validate({ body: putRulesSchema }), messagingController.putRules);

messagingRouter.get('/logs', validate({ query: listLogsQuerySchema }), messagingController.listLogs);
