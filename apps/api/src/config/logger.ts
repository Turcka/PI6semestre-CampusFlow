import pino from 'pino';

import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-candidate-token"]',
    'cpf',
    'body.cpf',
    'req.body.cpf',
    // Mensagens do visitante para o secretário virtual nunca vão para o log.
    'body.content',
    'req.body.content',
  ],
});
