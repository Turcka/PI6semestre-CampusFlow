import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LlmStructuredRequest } from '../../../integrations/llm/llm.types.js';
import type { QuestionRow, SessionRow } from '../chatbot.session.js';
import type { AssistantCandidate, MessageRow, NewMessage, SessionPatch, TenantContext } from './assistant.repository.js';

/** Banco em memória + LLM falsa, compartilhados com os mocks abaixo. */
const h = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  candidate: {} as Record<string, unknown>,
  questions: [] as unknown[],
  answers: [] as Array<{ question_id: string; value: unknown }>,
  messages: [] as Array<Record<string, unknown>>,
  assistant: {} as Record<string, unknown>,
  llmEnabled: true,
  generate: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../config/logger.js', () => ({ logger: h.log }));

vi.mock('../../../integrations/llm/llm.client.js', async () => {
  const types = await vi.importActual<typeof import('../../../integrations/llm/llm.types.js')>('../../../integrations/llm/llm.types.js');
  return { LlmError: types.LlmError, isLlmEnabled: () => h.llmEnabled, generateStructured: h.generate };
});

vi.mock('../chatbot.session.js', () => ({
  getSession: vi.fn(async () => ({ ...h.session })),
  getSessionQuestions: vi.fn(async () => h.questions),
}));

vi.mock('./assistant.repository.js', () => ({
  getCandidate: vi.fn(async () => ({ ...h.candidate })),
  getTenantContext: vi.fn(
    async (): Promise<TenantContext> => ({
      tenantName: 'Instituto Mauá de Tecnologia',
      campusName: 'São Caetano',
      courseName: 'Engenharia de Computação',
      assistant: h.assistant as TenantContext['assistant'],
    }),
  ),
  getAssistantSettings: vi.fn(async () => h.assistant),
  listAnswers: vi.fn(async () => h.answers.map((answer) => ({ ...answer }))),
  listMessages: vi.fn(async (_sessionId: string, options: { limit?: number } = {}) => {
    const visible = h.messages.filter((message) => message.role !== 'system');
    return (options.limit ? visible.slice(-options.limit) : visible) as MessageRow[];
  }),
  hasSynthesis: vi.fn(async () => h.messages.some((message) => message.role === 'system' && message.content === 'synthesis')),
  insertMessage: vi.fn(async (message: NewMessage) => {
    const row = { ...message, id: `m${h.messages.length + 1}`, created_at: new Date(2026, 10, 17, 12, 0, h.messages.length).toISOString() };
    h.messages.push(row);
    return row as unknown as MessageRow;
  }),
  upsertAnswers: vi.fn(async (_sessionId: string, answers: Array<{ questionId: string; value: unknown }>) => {
    for (const answer of answers) {
      h.answers = h.answers.filter((existing) => existing.question_id !== answer.questionId);
      h.answers.push({ question_id: answer.questionId, value: answer.value });
    }
  }),
  updateSession: vi.fn(async (_sessionId: string, patch: SessionPatch) => {
    Object.assign(h.session, patch);
  }),
  saveInsights: vi.fn(async (_candidateId: string, summary: string, insights: unknown) => {
    Object.assign(h.candidate, { profile_summary: summary, ai_insights: insights });
  }),
  listInterestNames: vi.fn(async () => ['Tecnologia']),
}));

const { LlmError } = await import('../../../integrations/llm/llm.types.js');
const { handleMessage, listMessages, setMode, synthesize } = await import('./assistant.service.js');

const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const TOKEN = '00000000-0000-4000-8000-00000000aaaa';

const QUESTIONS: QuestionRow[] = [
  {
    id: 'q-foco',
    key: 'foco_visita',
    prompt: 'O que você mais quer ver na visita?',
    kind: 'single_choice',
    options: [
      { value: 'tecnico', label: 'Laboratórios e tecnologia' },
      { value: 'academico', label: 'Salas de aula e professores' },
    ],
    order_index: 1,
    is_required: true,
    is_active: true,
  },
  {
    id: 'q-prioridades',
    key: 'prioridades_matricula',
    prompt: 'O que pesa mais na matrícula?',
    kind: 'multi_choice',
    options: [
      { value: 'custo_bolsas', label: 'Mensalidade, bolsas e financiamento' },
      { value: 'empregabilidade', label: 'Empregabilidade e estágios' },
      { value: 'infraestrutura', label: 'Laboratórios e infraestrutura' },
    ],
    order_index: 2,
    is_required: true,
    is_active: true,
  },
  { id: 'q-livre', key: 'expectativa', prompt: 'O que você espera da visita?', kind: 'free_text', options: [], order_index: 3, is_required: false, is_active: true },
];

type FakeTurn = Record<string, unknown>;

/** Próxima resposta da LLM; passa pelo `schema` da requisição, como o cliente real faz. */
function llmReturns(output: FakeTurn) {
  h.generate.mockImplementationOnce(async (req: LlmStructuredRequest<unknown>) => ({
    data: req.schema.parse(output),
    raw: JSON.stringify(output),
    model: 'modelo-teste',
    tokensIn: 100,
    tokensOut: 20,
    latencyMs: 5,
  }));
}

const lastRequest = () => h.generate.mock.calls.at(-1)?.[0] as LlmStructuredRequest<unknown>;
const session = () => h.session as unknown as SessionRow;
const stored = (role: string) => h.messages.filter((message) => message.role === role);

beforeEach(() => {
  vi.clearAllMocks();
  h.generate.mockReset();
  h.llmEnabled = true;
  h.session = {
    id: SESSION_ID,
    tenant_id: 'tenant-1',
    candidate_id: 'cand-1',
    profile_id: null,
    audience: 'candidato',
    status: 'in_progress',
    mode: 'llm',
    llm_turns: 0,
    llm_tokens_total: 0,
    fallback_reason: null,
  };
  h.candidate = {
    id: 'cand-1',
    tenant_id: 'tenant-1',
    full_name: 'Lucas Pereira Souza',
    portal_token: TOKEN,
    course_id: 'course-1',
    campus_id: 'campus-1',
    preferred_focus: 'tecnico',
    ai_insights: {},
  } satisfies AssistantCandidate;
  h.questions = QUESTIONS;
  h.answers = [];
  h.messages = [];
  h.assistant = { enabled: true, persona_name: 'Sofia', tone: 'acolhedor e direto', facts: [], max_turns: 16 };
});

describe('handleMessage', () => {
  it('fluxo feliz: mascara PII, grava só respostas válidas e devolve chips da pergunta feita', async () => {
    llmReturns({
      reply: 'Que bom, Lucas! E o que mais pesa para você na hora de escolher?',
      extracted: { foco_visita: 'tecnico', prioridades_matricula: ['preco_do_lanche'], pergunta_inventada: 'x' },
      nextQuestionKey: 'prioridades_matricula',
      questionsForVisit: ['Quais bolsas existem para o curso?'],
      done: false,
    });

    const result = await handleMessage(
      SESSION_ID,
      TOKEN,
      'Quero ver os labs! Meu cpf é 529.982.247-25, e-mail lucas@exemplo.com e zap (11) 98765-4321',
    );

    // O que o visitante escreveu é gravado e enviado ao provedor já mascarado.
    const userMessage = stored('user')[0]!;
    expect(userMessage.content).toBe('Quero ver os labs! Meu cpf é [cpf], e-mail [email] e zap [telefone]');
    const sent = JSON.stringify(lastRequest().messages);
    expect(sent).toContain('[cpf]');
    for (const secret of ['529.982.247-25', 'lucas@exemplo.com', '98765-4321', 'Pereira', 'Souza']) expect(sent).not.toContain(secret);
    expect(lastRequest().messages[0]).toMatchObject({ role: 'system' });
    expect(lastRequest().messages[0]!.content).toContain('conversando com Lucas,');

    // Só o que bate com as options é gravado.
    expect(h.answers).toEqual([{ question_id: 'q-foco', value: { value: 'tecnico' } }]);
    expect(result.extracted).toEqual({ foco_visita: 'tecnico' });
    expect(result.rejected).toEqual(['prioridades_matricula', 'pergunta_inventada']);

    expect(result.message).toMatchObject({ role: 'assistant', content: 'Que bom, Lucas! E o que mais pesa para você na hora de escolher?' });
    expect(result.questionsForVisit).toEqual(['Quais bolsas existem para o curso?']);
    expect(result.quickReplies).toEqual([
      { value: 'custo_bolsas', label: 'Mensalidade, bolsas e financiamento' },
      { value: 'empregabilidade', label: 'Empregabilidade e estágios' },
      { value: 'infraestrutura', label: 'Laboratórios e infraestrutura' },
    ]);
    expect(result.progress).toBeCloseTo(1 / 3);
    expect(result.done).toBe(false);
    expect(result.turnsLeft).toBe(15);
    expect(result.fallback).toBeNull();

    expect(session()).toMatchObject({ mode: 'llm', llm_turns: 1, llm_tokens_total: 120 });
    expect(stored('assistant')[0]).toMatchObject({ model: 'modelo-teste', tokens_in: 100, tokens_out: 20 });
  });

  it('nunca escreve o conteúdo das mensagens no log', async () => {
    llmReturns({ reply: 'Resposta secreta da assistente', extracted: {}, done: false });
    await handleMessage(SESSION_ID, TOKEN, 'Mensagem secreta do visitante');

    const logged = JSON.stringify([h.log.info.mock.calls, h.log.warn.mock.calls, h.log.debug.mock.calls, h.log.error.mock.calls]);
    expect(logged).not.toContain('secreta');
  });

  it('marca done quando a LLM encerra e não há pergunta obrigatória pendente', async () => {
    h.answers = [{ question_id: 'q-foco', value: { value: 'tecnico' } }];
    llmReturns({
      reply: 'Perfeito, obrigado! Já tenho o que preciso.',
      extracted: { prioridades_matricula: ['empregabilidade', 'custo_bolsas'] },
      nextQuestionKey: 'expectativa',
      done: true,
    });

    const result = await handleMessage(SESSION_ID, TOKEN, 'Emprego em primeiro lugar, depois o custo');

    expect(h.answers).toContainEqual({ question_id: 'q-prioridades', value: { values: ['empregabilidade', 'custo_bolsas'] } });
    expect(result.done).toBe(true);
    expect(result.quickReplies).toEqual([]);
    expect(result.progress).toBeCloseTo(2 / 3);
  });

  it('ignora done da LLM enquanto houver pergunta obrigatória pendente', async () => {
    llmReturns({ reply: 'Obrigado, terminamos!', extracted: { foco_visita: 'academico' }, done: true });
    const result = await handleMessage(SESSION_ID, TOKEN, 'Quero conhecer os professores');
    expect(result.done).toBe(false);
  });

  it('timeout da LLM: volta para os botões sem perder o que já foi salvo', async () => {
    h.answers = [{ question_id: 'q-foco', value: { value: 'tecnico' } }];
    h.generate.mockRejectedValueOnce(new LlmError('timeout', 'Tempo limite da LLM excedido.'));

    const result = await handleMessage(SESSION_ID, TOKEN, 'O que pesa é o custo');

    expect(result).toMatchObject({ message: null, extracted: {}, done: false, turnsLeft: 0, fallback: { mode: 'guided', reason: 'timeout' } });
    expect(result.progress).toBeCloseTo(1 / 3);
    expect(session()).toMatchObject({ mode: 'guided', fallback_reason: 'timeout', llm_turns: 0 });
    expect(h.answers).toEqual([{ question_id: 'q-foco', value: { value: 'tecnico' } }]);
    expect(stored('user')).toHaveLength(1);
    expect(stored('assistant')).toHaveLength(0);
  });

  it.each([
    ['rate_limited', 'rate_limited'],
    ['invalid_output', 'invalid_output'],
    ['provider', 'provider'],
  ] as const)('erro %s do provedor também vira fallback', async (kind, reason) => {
    h.generate.mockRejectedValueOnce(new LlmError(kind, 'falhou'));
    const result = await handleMessage(SESSION_ID, TOKEN, 'oi');
    expect(result.fallback).toEqual({ mode: 'guided', reason });
  });

  it('erro que não é da LLM não é engolido', async () => {
    h.generate.mockRejectedValueOnce(new Error('bug inesperado'));
    await expect(handleMessage(SESSION_ID, TOKEN, 'oi')).rejects.toThrow('bug inesperado');
    expect(session().mode).toBe('llm');
  });

  it('limite de turnos: fallback sem chamar a LLM nem gravar a mensagem', async () => {
    h.session.llm_turns = 16;
    const result = await handleMessage(SESSION_ID, TOKEN, 'mais uma');

    expect(result.fallback).toEqual({ mode: 'guided', reason: 'max_turns' });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.messages).toHaveLength(0);
    expect(session()).toMatchObject({ mode: 'guided', fallback_reason: 'max_turns' });
  });

  it('respeita o max_turns configurado no tenant', async () => {
    h.assistant.max_turns = 4;
    h.session.llm_turns = 4;
    expect((await handleMessage(SESSION_ID, TOKEN, 'oi')).fallback?.reason).toBe('max_turns');
  });

  it('orçamento de tokens da sessão esgotado: fallback', async () => {
    h.session.llm_tokens_total = 40_000;
    const result = await handleMessage(SESSION_ID, TOKEN, 'oi');
    expect(result.fallback).toEqual({ mode: 'guided', reason: 'token_budget' });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('LLM desligada ou assistente desabilitado no tenant: fallback disabled', async () => {
    h.llmEnabled = false;
    expect((await handleMessage(SESSION_ID, TOKEN, 'oi')).fallback?.reason).toBe('disabled');

    h.llmEnabled = true;
    h.session.mode = 'llm';
    h.assistant.enabled = false;
    expect((await handleMessage(SESSION_ID, TOKEN, 'oi')).fallback?.reason).toBe('disabled');
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('token inválido: 403 e nada é gravado nem enviado', async () => {
    await expect(handleMessage(SESSION_ID, '00000000-0000-4000-8000-00000000bbbb', 'oi')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    await expect(handleMessage(SESSION_ID, '', 'oi')).rejects.toMatchObject({ statusCode: 403 });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.messages).toHaveLength(0);
  });

  it('sessão por botões -> 409 SESSION_NOT_LLM; concluída -> 409 SESSION_COMPLETED', async () => {
    h.session.mode = 'guided';
    await expect(handleMessage(SESSION_ID, TOKEN, 'oi')).rejects.toMatchObject({ statusCode: 409, code: 'SESSION_NOT_LLM' });

    h.session.mode = 'llm';
    h.session.status = 'completed';
    await expect(handleMessage(SESSION_ID, TOKEN, 'oi')).rejects.toMatchObject({ statusCode: 409, code: 'SESSION_COMPLETED' });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('mensagens simultâneas da mesma sessão são processadas uma de cada vez', async () => {
    llmReturns({ reply: 'primeira', extracted: {}, done: false });
    llmReturns({ reply: 'segunda', extracted: {}, done: false });

    await Promise.all([handleMessage(SESSION_ID, TOKEN, 'a'), handleMessage(SESSION_ID, TOKEN, 'b')]);

    expect(h.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(session()).toMatchObject({ llm_turns: 2, llm_tokens_total: 240 });
  });
});

describe('listMessages', () => {
  it('gera a saudação uma única vez, mesmo com leituras simultâneas', async () => {
    llmReturns({ reply: 'Oi, Lucas! Eu sou a Sofia. O que você mais quer ver na visita?', extracted: { foco_visita: 'tecnico' }, done: false });

    const [first, second] = await Promise.all([listMessages(SESSION_ID, TOKEN), listMessages(SESSION_ID, TOKEN)]);

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(lastRequest().messages).toHaveLength(1); // só o prompt de sistema: histórico vazio
    for (const conversation of [first, second]) {
      expect(conversation.mode).toBe('llm');
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toMatchObject({ role: 'assistant' });
    }
    // Sem mensagem do visitante nada é extraído, e a saudação não consome turno.
    expect(h.answers).toEqual([]);
    expect(session()).toMatchObject({ llm_turns: 0, llm_tokens_total: 120 });
    expect(first.turnsLeft).toBe(16);
    expect(first.done).toBe(false);
  });

  it('se a saudação falhar, a sessão passa para os botões', async () => {
    h.generate.mockRejectedValueOnce(new LlmError('provider', 'fora do ar'));
    const conversation = await listMessages(SESSION_ID, TOKEN);
    expect(conversation).toMatchObject({ mode: 'guided', fallbackReason: 'provider', messages: [], turnsLeft: 0 });
  });

  it('não chama a LLM quando já há mensagens nem em sessão por botões', async () => {
    h.messages = [{ id: 'm1', role: 'assistant', content: 'Oi!', created_at: '2026-11-17T12:00:00.000Z' }];
    expect((await listMessages(SESSION_ID, TOKEN)).messages).toHaveLength(1);

    h.messages = [];
    h.session.mode = 'guided';
    expect((await listMessages(SESSION_ID, TOKEN)).mode).toBe('guided');
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('não devolve mensagens system e exige o token do candidato', async () => {
    h.messages = [
      { id: 'm1', role: 'assistant', content: 'Oi!', created_at: '2026-11-17T12:00:00.000Z' },
      { id: 'm2', role: 'system', content: 'synthesis', created_at: '2026-11-17T12:01:00.000Z' },
    ];
    expect((await listMessages(SESSION_ID, TOKEN)).messages.map((message) => message.role)).toEqual(['assistant']);
    await expect(listMessages(SESSION_ID, 'outro-token')).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('setMode', () => {
  it('guided: troca o modo e devolve a próxima pergunta pendente', async () => {
    h.answers = [{ question_id: 'q-foco', value: { value: 'tecnico' } }];
    const result = await setMode(SESSION_ID, TOKEN, 'guided');
    expect(result.mode).toBe('guided');
    expect(result.question).toMatchObject({ key: 'prioridades_matricula' });
    expect(result.progress).toBeCloseTo(1 / 3);
    expect(session()).toMatchObject({ mode: 'guided', fallback_reason: 'user_choice' });
  });

  it('llm só é aceito com a LLM ligada e o assistente habilitado', async () => {
    h.session.mode = 'guided';
    h.llmEnabled = false;
    await expect(setMode(SESSION_ID, TOKEN, 'llm')).rejects.toMatchObject({ statusCode: 409, code: 'ASSISTANT_UNAVAILABLE' });

    h.llmEnabled = true;
    expect((await setMode(SESSION_ID, TOKEN, 'llm')).mode).toBe('llm');
    expect(session()).toMatchObject({ mode: 'llm', fallback_reason: null });
  });

  it('token inválido -> 403', async () => {
    await expect(setMode(SESSION_ID, 'errado', 'guided')).rejects.toMatchObject({ statusCode: 403 });
    expect(session().mode).toBe('llm');
  });
});

describe('synthesize', () => {
  const conversation = () => [
    { id: 'm1', role: 'assistant', content: 'Oi, Lucas!', created_at: '2026-11-17T12:00:00.000Z' },
    { id: 'm2', role: 'user', content: 'Quero ver os labs e saber de bolsa', created_at: '2026-11-17T12:00:05.000Z' },
  ];

  it('devolve null quando o visitante não escreveu nada (sessão só por botões)', async () => {
    h.messages = [{ id: 'm1', role: 'assistant', content: 'Oi, Lucas!', created_at: '2026-11-17T12:00:00.000Z' }];
    expect(await synthesize(SESSION_ID)).toBeNull();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('grava resumo e insights validados, sem enviar dados pessoais', async () => {
    h.messages = conversation();
    h.answers = [
      { question_id: 'q-foco', value: { value: 'tecnico' } },
      { question_id: 'q-livre', value: { value: 'me liga no (11) 98765-4321' } },
    ];
    llmReturns({
      summary: 'Lucas quer conhecer os laboratórios e tem dúvidas sobre bolsas.',
      priorities: [{ key: 'custo_bolsas', rank: 1, evidence: 'saber de bolsa' }, { key: 'inexistente', rank: 2 }],
      goals: ['ver os laboratórios'],
      doubts: ['Quais bolsas existem?'],
      objections: [],
      decisionStage: 'comparando',
      influencers: ['pais'],
      schoolMoment: 'em3',
      decisionTimeline: 'este_semestre',
      suggestedFocus: 'tecnico',
      talkingPoints: ['Começar pelos laboratórios'],
    });

    const result = await synthesize(SESSION_ID);

    expect(result?.summary).toBe('Lucas quer conhecer os laboratórios e tem dúvidas sobre bolsas.');
    expect(result?.insights.priorities).toEqual([{ key: 'custo_bolsas', rank: 1, evidence: 'saber de bolsa' }]);
    expect(result?.insights).toMatchObject({ decisionStage: 'comparando', model: 'modelo-teste', summary: result?.summary });
    expect(h.candidate).toMatchObject({ profile_summary: result?.summary, ai_insights: result?.insights });
    expect(stored('system')[0]).toMatchObject({ content: 'synthesis', tokens_in: 100, tokens_out: 20 });
    expect(session().llm_tokens_total).toBe(120);

    const sent = JSON.stringify(lastRequest().messages);
    expect(sent).toContain('Laboratórios e tecnologia'); // resposta estruturada vai pelo label
    expect(sent).toContain('[telefone]');
    for (const secret of ['98765-4321', 'Pereira', 'Souza']) expect(sent).not.toContain(secret);
  });

  it('usa a resposta estruturada de prioridades quando a LLM não ranqueia nada', async () => {
    h.messages = conversation();
    h.answers = [{ question_id: 'q-prioridades', value: { values: ['empregabilidade', 'custo_bolsas'] } }];
    llmReturns({ summary: 'Lucas quer ver os laboratórios.', priorities: [], goals: [], doubts: [], objections: [], talkingPoints: [] });

    const result = await synthesize(SESSION_ID);
    expect(result?.insights.priorities).toEqual([
      { key: 'empregabilidade', rank: 1 },
      { key: 'custo_bolsas', rank: 2 },
    ]);
  });

  it('complete repetido reaproveita a síntese já feita, sem nova chamada', async () => {
    h.messages = conversation();
    llmReturns({ summary: 'Lucas quer ver os laboratórios.', priorities: [], goals: [], doubts: [], objections: [], talkingPoints: [] });
    const first = await synthesize(SESSION_ID);

    h.candidate.profile_summary = 'Foco preferido: tecnico'; // build_candidate_profile regravou
    const second = await synthesize(SESSION_ID);

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(h.candidate.profile_summary).toBe('Lucas quer ver os laboratórios.');
  });

  it('não chama o provedor com a LLM desligada e propaga falha do provedor', async () => {
    h.messages = conversation();
    h.llmEnabled = false;
    expect(await synthesize(SESSION_ID)).toBeNull();

    h.llmEnabled = true;
    h.generate.mockRejectedValueOnce(new LlmError('timeout', 'demorou'));
    await expect(synthesize(SESSION_ID)).rejects.toBeInstanceOf(LlmError);
    expect(h.candidate.ai_insights).toEqual({});
    expect(stored('system')).toHaveLength(0);
  });
});
