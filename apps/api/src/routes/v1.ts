import { Router } from 'express';

import { authMiddleware } from '../middlewares/auth.middleware.js';
import { authenticatedRateLimit } from '../middlewares/rate-limit.middleware.js';
import { tenantMiddleware } from '../middlewares/tenant.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { analyticsRouter } from '../modules/analytics/analytics.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { availabilityRouter } from '../modules/availability/availability.routes.js';
import { billingRouter } from '../modules/billing/billing.routes.js';
import { calendarRouter } from '../modules/calendar/calendar.routes.js';
import { checkinRouter } from '../modules/checkin/checkin.routes.js';
import { coursesRouter } from '../modules/courses/courses.routes.js';
import { leadsRouter } from '../modules/leads/leads.routes.js';
import { mapRouter } from '../modules/map/map.routes.js';
import { messagingRouter } from '../modules/messaging/messaging.routes.js';
import { schedulingRouter } from '../modules/scheduling/scheduling.routes.js';
import { tenantsRouter } from '../modules/tenants/tenants.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

export const v1Router = Router();

v1Router.use(authenticatedRateLimit);
v1Router.use(asyncHandler(authMiddleware));
v1Router.use(tenantMiddleware);

v1Router.use('/auth', authRouter);
v1Router.use('/tenants', tenantsRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/courses', coursesRouter);
v1Router.use('/leads', leadsRouter);
v1Router.use('/availability', availabilityRouter);
v1Router.use('/scheduling', schedulingRouter);
v1Router.use('/calendar', calendarRouter);
v1Router.use('/messaging', messagingRouter);
v1Router.use('/map', mapRouter);
v1Router.use('/checkin', checkinRouter);
v1Router.use('/analytics', analyticsRouter);
v1Router.use('/billing', billingRouter);
