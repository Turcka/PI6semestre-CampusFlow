import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'CampusFlow API',
    version: '0.1.0',
    description:
      'API REST do CampusFlow: leads, agendamento anti double-booking, mensageria, mapa e analytics.',
  },
  servers: [{ url: '/api/v1', description: 'API versionada' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        security: [],
        summary: 'Health check',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/auth/me': {
      get: { summary: 'Perfil do usuário autenticado', responses: { '200': { description: 'OK' } } },
    },
    '/leads': {
      get: { summary: 'Lista leads', responses: { '200': { description: 'OK' } } },
    },
    '/public/scheduling/slots': {
      get: {
        security: [],
        summary: 'Horários disponíveis (candidato)',
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

export function mountOpenApi(app: Express): void {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
}
