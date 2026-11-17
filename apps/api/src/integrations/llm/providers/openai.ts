import { LlmError, type LlmProvider, type ProviderRequest } from '../llm.types.js';
import { asNumber, asRecord, httpError, postJson } from './http.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MAX_ADAPTATIONS = 3;

type Flavor = 'openai' | 'openai_compatible';

function buildBody(req: ProviderRequest, flavor: Flavor): Record<string, unknown> {
  return {
    model: req.model,
    messages: [{ role: 'system', content: req.system }, ...req.messages],
    temperature: req.temperature,
    // A API da OpenAI usa max_completion_tokens; servidores compatíveis costumam aceitar só max_tokens.
    ...(flavor === 'openai' ? { max_completion_tokens: req.maxOutputTokens } : { max_tokens: req.maxOutputTokens }),
    response_format:
      flavor === 'openai'
        ? { type: 'json_schema', json_schema: { name: 'resposta', schema: req.jsonSchema, strict: false } }
        : { type: 'json_object' },
  };
}

/**
 * Alguns modelos/servidores rejeitam parâmetros específicos com 400 (ex.: `temperature` em modelos
 * de raciocínio, `max_tokens` vs `max_completion_tokens`, `json_schema` sem suporte). Ajusta o corpo
 * e devolve `true` quando vale a pena tentar de novo.
 */
function adaptBody(body: Record<string, unknown>, error: Record<string, unknown>): boolean {
  const param = typeof error.param === 'string' ? error.param : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const mentions = (name: string) => param === name || param.startsWith(`${name}.`) || message.includes(name);

  if (mentions('max_completion_tokens') && 'max_completion_tokens' in body && param !== 'max_tokens') {
    body.max_tokens = body.max_completion_tokens;
    delete body.max_completion_tokens;
    return true;
  }
  if (mentions('max_tokens') && 'max_tokens' in body) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
    return true;
  }
  if (mentions('temperature') && 'temperature' in body) {
    delete body.temperature;
    return true;
  }
  if ((mentions('response_format') || message.includes('json_schema')) && asRecord(body.response_format).type === 'json_schema') {
    body.response_format = { type: 'json_object' };
    return true;
  }
  return false;
}

function createOpenAiProvider(flavor: Flavor): LlmProvider {
  return async (req) => {
    const baseUrl = (req.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const body = buildBody(req, flavor);

    let res = await postJson(`${baseUrl}/chat/completions`, { Authorization: `Bearer ${req.apiKey}` }, body, req.signal);
    for (let i = 0; i < MAX_ADAPTATIONS && res.status === 400; i++) {
      if (!adaptBody(body, asRecord(asRecord(res.json).error))) break;
      res = await postJson(`${baseUrl}/chat/completions`, { Authorization: `Bearer ${req.apiKey}` }, body, req.signal);
    }

    if (!res.ok) {
      const error = asRecord(asRecord(res.json).error);
      const code = typeof error.code === 'string' ? error.code : typeof error.type === 'string' ? error.type : undefined;
      throw httpError(res, code);
    }

    const json = asRecord(res.json);
    const choice = asRecord((Array.isArray(json.choices) ? json.choices : [])[0]);
    const content = asRecord(choice.message).content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new LlmError('invalid_output', 'Provedor LLM devolveu resposta vazia.', {
        providerCode: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
      });
    }

    const usage = asRecord(json.usage);
    return {
      raw: content,
      model: typeof json.model === 'string' ? json.model : req.model,
      tokensIn: asNumber(usage.prompt_tokens),
      tokensOut: asNumber(usage.completion_tokens),
    };
  };
}

export const openaiProvider = createOpenAiProvider('openai');
export const openaiCompatibleProvider = createOpenAiProvider('openai_compatible');
