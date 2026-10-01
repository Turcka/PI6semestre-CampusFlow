import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as candidatesController from './candidates.controller.js';
import {
  candidateIdParamsSchema,
  candidateTokenQuerySchema,
  listCandidatesQuerySchema,
  lookupByEmailSchema,
  publicCandidatePatchSchema,
  publicCandidateSchema,
  updateCandidateSchema,
} from './candidates.schemas.js';

export const candidatesRouter = Router();

candidatesRouter.get('/', requireRole('admin'), validate({ query: listCandidatesQuerySchema }), candidatesController.list);
candidatesRouter.get('/:id', requireRole('admin'), validate({ params: candidateIdParamsSchema }), candidatesController.getById);
candidatesRouter.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: candidateIdParamsSchema, body: updateCandidateSchema }),
  candidatesController.patch,
);

export const publicCandidatesRouter = Router();
publicCandidatesRouter.post('/', validate({ body: publicCandidateSchema }), candidatesController.createPublic);
publicCandidatesRouter.post(
  '/lookup-by-email',
  validate({ body: lookupByEmailSchema }),
  candidatesController.lookupByEmail,
);
publicCandidatesRouter.get('/me', validate({ query: candidateTokenQuerySchema }), candidatesController.getMe);
publicCandidatesRouter.patch(
  '/me',
  validate({ query: candidateTokenQuerySchema, body: publicCandidatePatchSchema }),
  candidatesController.patchMe,
);
publicCandidatesRouter.get('/me/visits', validate({ query: candidateTokenQuerySchema }), candidatesController.listMeVisits);
