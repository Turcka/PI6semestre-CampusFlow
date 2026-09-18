import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as chatbotController from './chatbot.controller.js';
import {
  answerSchema,
  categoryIdParamsSchema,
  createQuestionSchema,
  interestCategorySchema,
  listQuestionsQuerySchema,
  questionIdParamsSchema,
  reorderQuestionsSchema,
  sessionIdParamsSchema,
  updateInterestCategorySchema,
  updateQuestionSchema,
} from './chatbot.schemas.js';

export const publicChatbotRouter = Router();
publicChatbotRouter.get('/sessions/:id/next', validate({ params: sessionIdParamsSchema }), chatbotController.next);
publicChatbotRouter.post('/sessions/:id/answers', validate({ params: sessionIdParamsSchema, body: answerSchema }), chatbotController.answer);
publicChatbotRouter.get('/sessions/:id/review', validate({ params: sessionIdParamsSchema }), chatbotController.review);
publicChatbotRouter.post('/sessions/:id/complete', validate({ params: sessionIdParamsSchema }), chatbotController.complete);

export const chatbotRouter = Router();
chatbotRouter.get('/questions', requireRole('admin'), validate({ query: listQuestionsQuerySchema }), chatbotController.listQuestions);
chatbotRouter.post('/questions', requireRole('admin'), validate({ body: createQuestionSchema }), chatbotController.createQuestion);
chatbotRouter.post('/questions/reorder', requireRole('admin'), validate({ body: reorderQuestionsSchema }), chatbotController.reorderQuestions);
chatbotRouter.patch('/questions/:id', requireRole('admin'), validate({ params: questionIdParamsSchema, body: updateQuestionSchema }), chatbotController.updateQuestion);
chatbotRouter.delete('/questions/:id', requireRole('admin'), validate({ params: questionIdParamsSchema }), chatbotController.deleteQuestion);

chatbotRouter.get('/interest-categories', requireRole('admin'), chatbotController.listInterestCategories);
chatbotRouter.post('/interest-categories', requireRole('admin'), validate({ body: interestCategorySchema }), chatbotController.createInterestCategory);
chatbotRouter.patch(
  '/interest-categories/:id',
  requireRole('admin'),
  validate({ params: categoryIdParamsSchema, body: updateInterestCategorySchema }),
  chatbotController.updateInterestCategory,
);
chatbotRouter.delete('/interest-categories/:id', requireRole('admin'), validate({ params: categoryIdParamsSchema }), chatbotController.deleteInterestCategory);
