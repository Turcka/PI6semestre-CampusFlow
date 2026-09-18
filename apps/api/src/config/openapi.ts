import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'CampusFlow API',
    version: '0.2.0',
    description:
      'API REST do CampusFlow (Revisão 2): candidatos, chatbot, match, convites, visitas, e-mail e Rubeus.',
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
    '/candidates': {
      get: { summary: 'Lista candidatos', responses: { '200': { description: 'OK' } } },
    },
    '/chatbot/questions': {
      get: { summary: 'Lista perguntas do chatbot', responses: { '200': { description: 'OK' } } },
    },
    '/public/candidates': {
      post: {
        security: [],
        summary: 'Cadastro público do candidato (passo 1 do chatbot)',
        responses: { '201': { description: 'Created' } },
      },
    },
    '/public/chatbot/sessions/{id}/next': {
      get: {
        security: [],
        summary: 'Próxima pergunta do chatbot',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/public/scheduling/windows': {
      get: {
        security: [],
        summary: 'Janelas com promotor elegível',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/public/scheduling/visits': {
      post: {
        security: [],
        summary: 'Agenda visita com match',
        responses: { '201': { description: 'Created' } },
      },
    },
    '/invitations/me': {
      get: { summary: 'Convites do usuário', responses: { '200': { description: 'OK' } } },
    },
    '/visits': {
      get: { summary: 'Lista visitas', responses: { '200': { description: 'OK' } } },
    },
    '/match/preview': {
      post: { summary: 'Preview do ranking de match', responses: { '200': { description: 'OK' } } },
    },
    '/analytics/overview': {
      get: { summary: 'KPIs de visitas', responses: { '200': { description: 'OK' } } },
    },
  },
};

export function mountOpenApi(app: Express): void {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
}
