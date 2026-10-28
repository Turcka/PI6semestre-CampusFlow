import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { answerSchema, sessionIdParamsSchema } from '../chatbot/chatbot.schemas.js';
import * as promotersController from './promoters.controller.js';
import {
  listMyVisitsQuerySchema,
  listPromotersQuerySchema,
  promoterIdParamsSchema,
  updatePromoterProfileSchema,
} from './promoters.schemas.js';

export const promotersRouter = Router();

const promoterOnly = requireRole('promotor');

promotersRouter.get('/', requireRole('admin'), validate({ query: listPromotersQuerySchema }), promotersController.list);
promotersRouter.get('/me/visits', promoterOnly, validate({ query: listMyVisitsQuerySchema }), promotersController.myVisits);
promotersRouter.get('/me/history', promoterOnly, promotersController.myHistory);
promotersRouter.put('/me/profile', requireRole('promotor', 'admin'), validate({ body: updatePromoterProfileSchema }), promotersController.updateMe);

// Onboarding obrigatório do promotor (E5): questionário comportamental com validade de 6 meses.
promotersRouter.get('/me/onboarding', promoterOnly, promotersController.onboardingStatus);
promotersRouter.post('/me/onboarding/session', promoterOnly, promotersController.onboardingStart);
promotersRouter.get(
  '/me/onboarding/session/:id/next',
  promoterOnly,
  validate({ params: sessionIdParamsSchema }),
  promotersController.onboardingNext,
);
promotersRouter.post(
  '/me/onboarding/session/:id/answers',
  promoterOnly,
  validate({ params: sessionIdParamsSchema, body: answerSchema }),
  promotersController.onboardingAnswer,
);
promotersRouter.get(
  '/me/onboarding/session/:id/review',
  promoterOnly,
  validate({ params: sessionIdParamsSchema }),
  promotersController.onboardingReview,
);
promotersRouter.post(
  '/me/onboarding/session/:id/complete',
  promoterOnly,
  validate({ params: sessionIdParamsSchema }),
  promotersController.onboardingComplete,
);

promotersRouter.get('/:id', requireRole('admin', 'promotor'), validate({ params: promoterIdParamsSchema }), promotersController.getById);
