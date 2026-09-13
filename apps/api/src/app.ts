import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { mountOpenApi } from './config/openapi.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { healthRouter } from './modules/health/health.routes.js';
import { publicRouter } from './routes/public.js';
import { v1Router } from './routes/v1.js';
import { webhooksRouter } from './routes/webhooks.js';

/**
 * Monta a aplicação Express. Separado de `server.ts` para permitir testes
 * de integração com supertest sem abrir porta.
 */
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  app.use('/health', healthRouter);
  mountOpenApi(app);

  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/webhooks', webhooksRouter);
  app.use('/api/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
