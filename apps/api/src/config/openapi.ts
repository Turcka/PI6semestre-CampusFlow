import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const sessionIdParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

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
      candidateToken: { type: 'apiKey', in: 'header', name: 'X-Candidate-Token' },
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
    '/public/chatbot/sessions/{id}/messages': {
      get: {
        security: [{ candidateToken: [] }],
        summary: 'Histórico da conversa com o secretário virtual (gera a saudação na primeira chamada)',
        parameters: [sessionIdParam],
        responses: {
          '200': { description: 'mode, status, progress, done, turnsLeft, fallbackReason e messages' },
          '401': { description: 'Token do candidato ausente' },
          '403': { description: 'Token não pertence ao candidato da sessão' },
          '429': { description: 'Limite de 20 requisições por minuto por sessão' },
        },
      },
      post: {
        security: [{ candidateToken: [] }],
        summary: 'Envia uma mensagem do visitante ao secretário virtual',
        parameters: [sessionIdParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: { content: { type: 'string', minLength: 1, maxLength: 1000 } },
              },
            },
          },
        },
        responses: {
          '200': {
            description:
              'reply, quickReplies, progress, done e turnsLeft; quando a LLM falha ou atinge um limite, vem fallback { mode: "guided", reason } e o front segue com /next e /answers',
          },
          '401': { description: 'Token do candidato ausente' },
          '403': { description: 'Token não pertence ao candidato da sessão' },
          '409': { description: 'SESSION_COMPLETED ou SESSION_NOT_LLM' },
          '422': { description: 'Mensagem vazia ou com mais de 1000 caracteres' },
          '429': { description: 'Limite de 20 requisições por minuto por sessão' },
        },
      },
    },
    '/public/chatbot/sessions/{id}/mode': {
      post: {
        security: [{ candidateToken: [] }],
        summary: 'Alterna a sessão entre o secretário virtual (llm) e o questionário por botões (guided)',
        parameters: [sessionIdParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mode'],
                properties: { mode: { type: 'string', enum: ['guided', 'llm'] } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'mode, progress, question e isLast' },
          '401': { description: 'Token do candidato ausente' },
          '403': { description: 'Token não pertence ao candidato da sessão' },
          '409': { description: 'SESSION_COMPLETED ou ASSISTANT_UNAVAILABLE' },
        },
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
    '/analytics/priorities': {
      get: {
        summary: 'Prioridades de matrícula citadas na conversa com o secretário virtual (admin)',
        parameters: [{ name: 'courseId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'respondents e items [{ key, label, mentions, top1, avgRank }]' } },
      },
    },
    '/candidates/{id}/transcript': {
      get: {
        summary: 'Transcrição da última conversa do candidato com o secretário virtual (admin)',
        parameters: [sessionIdParam],
        responses: { '200': { description: 'session, insights e messages (sem mensagens de sistema)' } },
      },
    },
    '/tenants/current/settings': {
      get: {
        summary: 'Configuração do assistente virtual do tenant (admin)',
        responses: { '200': { description: 'assistant e llmAvailable' } },
      },
      patch: {
        summary: 'Atualiza settings.assistant preservando as demais configurações (admin)',
        responses: { '200': { description: 'assistant e llmAvailable' }, '422': { description: 'Configuração inválida' } },
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
