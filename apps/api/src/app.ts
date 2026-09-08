import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { healthRouter } from './modules/health/health.routes.js';

/**
 * Monta a aplicação Express. Separado de `server.ts` para permitir testes
 * de integração com supertest sem abrir porta.
 */
export function createApp(): Express {
  const app = express();

  // Segurança e parsing
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

  // Rotas
  app.use('/health', healthRouter);

  // Rotas versionadas dos módulos de domínio serão registradas aqui:
  // app.use('/api/v1/leads', authMiddleware, tenantMiddleware, leadsRouter);
  // app.use('/api/v1/scheduling', authMiddleware, tenantMiddleware, schedulingRouter);
  // app.use('/api/v1/messaging', authMiddleware, tenantMiddleware, messagingRouter);
  // ...

  // Tratamento de erros
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
