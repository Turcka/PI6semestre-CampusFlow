import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const h = vi.hoisted(() => ({
  env: {
    LLM_ENABLED: true,
    LLM_PROVIDER: 'openai' as 'openai' | 'anthropic' | 'gemini' | 'openai_compatible',
    LLM_API_KEY: 'chave-de-teste' as string | undefined,
    LLM_BASE_URL: undefined as string | undefined,
    LLM_MODEL: 'modelo-x',
    LLM_TIMEOUT_MS: 12_000,
    LLM_MAX_OUTPUT_TOKENS: 400,
  },
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../config/env.js', () => ({ env: h.env }));
vi.mock('../../config/logger.js', () => ({ logger: h.log }));

const { LlmError, generateStructured, isLlmEnabled, normalizeConversation, parseJsonOutput } = await import('./llm.client.js');

const schema = z.object({ reply: z.string() });
const jsonSchema = { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'] };
const request = {
  messages: [
    { role: 'system' as const, content: 'instruções' },
    { role: 'user' as const, content: 'Texto do visitante' },
  ],
  schema,
  jsonSchema,
};

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...init.headers } });
}

const openAiOk = (content: string) =>
  jsonResponse({ model: 'modelo-x-2026', choices: [{ message: { content } }], usage: { prompt_tokens: 50, completion_tokens: 7 } });

const sentBody = (call = 0) => JSON.parse((fetchMock.mock.calls[call]![1] as FetchInit).body as string) as Record<string, unknown>;
const sentHeaders = (call = 0) => (fetchMock.mock.calls[call]![1] as FetchInit).headers as Record<string, string>;

beforeEach(() => {
  Object.assign(h.env, { LLM_ENABLED: true, LLM_PROVIDER: 'openai', LLM_API_KEY: 'chave-de-teste', LLM_BASE_URL: undefined, LLM_TIMEOUT_MS: 12_000 });
  fetchMock.mockReset();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isLlmEnabled', () => {
  it('exige o flag e a chave', () => {
    expect(isLlmEnabled()).toBe(true);
    h.env.LLM_API_KEY = undefined;
    expect(isLlmEnabled()).toBe(false);
    h.env.LLM_API_KEY = 'x';
    h.env.LLM_ENABLED = false;
    expect(isLlmEnabled()).toBe(false);
  });

  it('desligada: generateStructured lança disabled sem tocar na rede', async () => {
    h.env.LLM_ENABLED = false;
    await expect(generateStructured(request)).rejects.toMatchObject({ kind: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('normalizeConversation', () => {
  it('separa system, funde papéis repetidos e começa por user', () => {
    expect(
      normalizeConversation([
        { role: 'system', content: 'a' },
        { role: 'assistant', content: 'Oi!' },
        { role: 'user', content: 'um' },
        { role: 'user', content: 'dois' },
      ]),
    ).toEqual({
      system: 'a',
      messages: [
        { role: 'user', content: '(início da conversa)' },
        { role: 'assistant', content: 'Oi!' },
        { role: 'user', content: 'um\ndois' },
      ],
    });
  });
});

describe('parseJsonOutput', () => {
  it('aceita JSON puro, cercado por código ou com texto em volta', () => {
    expect(parseJsonOutput('{"reply":"oi"}')).toEqual({ reply: 'oi' });
    expect(parseJsonOutput('```json\n{"reply":"oi"}\n```')).toEqual({ reply: 'oi' });
    expect(parseJsonOutput('Claro! {"reply":"usa {chaves} e \\"aspas\\""} espero ter ajudado')).toEqual({ reply: 'usa {chaves} e "aspas"' });
  });

  it('lança invalid_output quando não há JSON', () => {
    expect(() => parseJsonOutput('não sei responder')).toThrowError(LlmError);
    expect(() => parseJsonOutput('{"reply": ')).toThrowError(LlmError);
  });
});

describe('generateStructured', () => {
  it('OpenAI: monta a chamada e devolve dados validados com tokens', async () => {
    fetchMock.mockResolvedValueOnce(openAiOk('{"reply":"olá"}'));

    const result = await generateStructured(request);

    expect(result).toMatchObject({ data: { reply: 'olá' }, model: 'modelo-x-2026', tokensIn: 50, tokensOut: 7 });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(sentHeaders().Authorization).toBe('Bearer chave-de-teste');
    expect(sentBody()).toMatchObject({
      model: 'modelo-x',
      max_completion_tokens: 400,
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'instruções' },
        { role: 'user', content: 'Texto do visitante' },
      ],
      response_format: { type: 'json_schema' },
    });
  });

  it('openai_compatible: usa LLM_BASE_URL, max_tokens e json_object', async () => {
    Object.assign(h.env, { LLM_PROVIDER: 'openai_compatible', LLM_BASE_URL: 'http://127.0.0.1:11434/v1/' });
    fetchMock.mockResolvedValueOnce(openAiOk('{"reply":"olá"}'));

    await generateStructured({ ...request, maxOutputTokens: 900, temperature: 0.2 });

    expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(sentBody()).toMatchObject({ max_tokens: 900, temperature: 0.2, response_format: { type: 'json_object' } });
  });

  it('Anthropic: força a ferramenta e lê tool_use.input', async () => {
    h.env.LLM_PROVIDER = 'anthropic';
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        model: 'claude-x',
        content: [{ type: 'tool_use', name: 'responder', input: { reply: 'olá' } }],
        usage: { input_tokens: 40, output_tokens: 9 },
      }),
    );

    const result = await generateStructured(request);

    expect(result).toMatchObject({ data: { reply: 'olá' }, model: 'claude-x', tokensIn: 40, tokensOut: 9 });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.anthropic.com/v1/messages');
    expect(sentHeaders()).toMatchObject({ 'x-api-key': 'chave-de-teste', 'anthropic-version': '2023-06-01' });
    expect(sentBody()).toMatchObject({
      system: 'instruções',
      messages: [{ role: 'user', content: 'Texto do visitante' }],
      tool_choice: { type: 'tool', name: 'responder' },
      tools: [{ name: 'responder', input_schema: jsonSchema }],
    });
  });

  it('Gemini: usa generateContent com saída JSON', async () => {
    h.env.LLM_PROVIDER = 'gemini';
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        modelVersion: 'gemini-x',
        candidates: [{ content: { parts: [{ text: '{"reply":"olá"}' }] } }],
        usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 5 },
      }),
    );

    const result = await generateStructured(request);

    expect(result).toMatchObject({ data: { reply: 'olá' }, model: 'gemini-x', tokensIn: 30, tokensOut: 5 });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/modelo-x:generateContent');
    expect(sentHeaders()['x-goog-api-key']).toBe('chave-de-teste');
    expect(sentBody()).toMatchObject({
      systemInstruction: { parts: [{ text: 'instruções' }] },
      contents: [{ role: 'user', parts: [{ text: 'Texto do visitante' }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
  });

  it('repete uma vez em 5xx e em erro de rede', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'instável' } }, { status: 503 })).mockResolvedValueOnce(openAiOk('{"reply":"ok"}'));
    expect((await generateStructured(request)).data).toEqual({ reply: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(openAiOk('{"reply":"ok"}'));
    expect((await generateStructured(request)).data).toEqual({ reply: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('desiste depois da segunda falha repetível', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: { message: 'fora' } }, { status: 500 }));
    await expect(generateStructured(request)).rejects.toMatchObject({ kind: 'provider' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 com Retry-After curto repete; com Retry-After longo devolve rate_limited na hora', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'rate_limit_exceeded' } }, { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(openAiOk('{"reply":"ok"}'));
    expect((await generateStructured(request)).data).toEqual({ reply: 'ok' });

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'rate_limit_exceeded' } }, { status: 429, headers: { 'retry-after': '30' } }));
    await expect(generateStructured(request)).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('4xx (chave inválida) não é repetido', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_api_key' } }, { status: 401 }));
    await expect(generateStructured(request)).rejects.toMatchObject({ kind: 'provider' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('400 por parâmetro não suportado: ajusta o corpo e tenta de novo', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { param: 'temperature', message: "Unsupported value: 'temperature'" } }, { status: 400 }))
      .mockResolvedValueOnce(openAiOk('{"reply":"ok"}'));

    expect((await generateStructured(request)).data).toEqual({ reply: 'ok' });
    expect(sentBody(0)).toHaveProperty('temperature');
    expect(sentBody(1)).not.toHaveProperty('temperature');
  });

  it('saída fora do formato vira invalid_output, sem repetir', async () => {
    fetchMock.mockResolvedValueOnce(openAiOk('{"resposta":"faltou o campo reply"}'));
    await expect(generateStructured(request)).rejects.toMatchObject({ kind: 'invalid_output' });

    fetchMock.mockResolvedValueOnce(openAiOk('desculpe, não consigo'));
    await expect(generateStructured(request)).rejects.toMatchObject({ kind: 'invalid_output' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('estoura o prazo -> timeout', async () => {
    h.env.LLM_TIMEOUT_MS = 30;
    fetchMock.mockImplementation(
      (_url: string, init: FetchInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    await expect(generateStructured(request)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('não escreve o conteúdo das mensagens nem a chave no log', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'x' } }, { status: 401 }));
    await expect(generateStructured(request)).rejects.toBeInstanceOf(LlmError);
    fetchMock.mockResolvedValueOnce(openAiOk('{"reply":"Resposta da assistente"}'));
    await generateStructured(request);

    const logged = JSON.stringify([h.log.info.mock.calls, h.log.warn.mock.calls, h.log.debug.mock.calls, h.log.error.mock.calls]);
    for (const secret of ['Texto do visitante', 'instruções', 'Resposta da assistente', 'chave-de-teste']) expect(logged).not.toContain(secret);
    expect(logged).toContain('"kind":"provider"');
  });
});
