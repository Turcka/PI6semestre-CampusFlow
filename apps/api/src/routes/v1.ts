import { Router } from 'express';

import { authMiddleware } from '../middlewares/auth.middleware.js';
import { authenticatedRateLimit } from '../middlewares/rate-limit.middleware.js';
import { tenantMiddleware } from '../middlewares/tenant.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { analyticsRouter } from '../modules/analytics/analytics.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { availabilityRouter } from '../modules/availability/availability.routes.js';
import { calendarRouter } from '../modules/calendar/calendar.routes.js';
import { candidatesRouter } from '../modules/candidates/candidates.routes.js';
import { chatbotRouter } from '../modules/chatbot/chatbot.routes.js';
import { conversionRouter } from '../modules/conversion/conversion.routes.js';
import { coursesRouter } from '../modules/courses/courses.routes.js';
import { invitationsRouter } from '../modules/invitations/invitations.routes.js';
import { mapRouter } from '../modules/map/map.routes.js';
import { matchRouter } from '../modules/match/match.routes.js';
import { messagingRouter } from '../modules/messaging/messaging.routes.js';
import { professorsRouter } from '../modules/professors/professors.routes.js';
import { promotersRouter } from '../modules/promoters/promoters.routes.js';
import { schedulingRouter } from '../modules/scheduling/scheduling.routes.js';
import { tenantsRouter } from '../modules/tenants/tenants.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { visitsRouter } from '../modules/visits/visits.routes.js';

export const v1Router = Router();

v1Router.use(authenticatedRateLimit);
v1Router.use(asyncHandler(authMiddleware));
v1Router.use(tenantMiddleware);

v1Router.use('/auth', authRouter);
v1Router.use('/tenants', tenantsRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/courses', coursesRouter);
v1Router.use('/candidates', candidatesRouter);
v1Router.use('/chatbot', chatbotRouter);
v1Router.use('/availability', availabilityRouter);
v1Router.use('/scheduling', schedulingRouter);
v1Router.use('/calendar', calendarRouter);
v1Router.use('/messaging', messagingRouter);
v1Router.use('/map', mapRouter);
v1Router.use('/analytics', analyticsRouter);
v1Router.use('/promoters', promotersRouter);
v1Router.use('/professors', professorsRouter);
v1Router.use('/match', matchRouter);
v1Router.use('/invitations', invitationsRouter);
v1Router.use('/visits', visitsRouter);
v1Router.use('/conversion', conversionRouter);
