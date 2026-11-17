import { LlmError, type LlmProvider } from '../llm.types.js';
import { asNumber, asRecord, httpError, postJson } from './http.js';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const TOOL_NAME = 'responder';

/** Messages API. A saída estruturada é obtida forçando o uso de uma única ferramenta. */
export const anthropicProvider: LlmProvider = async (req) => {
  const baseUrl = (req.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const res = await postJson(
    `${baseUrl}/v1/messages`,
    { 'x-api-key': req.apiKey, 'anthropic-version': API_VERSION },
    {
      model: req.model,
      max_tokens: req.maxOutputTokens,
      temperature: req.temperature,
      system: req.system,
      messages: req.messages,
      tools: [
        {
          name: TOOL_NAME,
          description: 'Registra a resposta estruturada no formato pedido.',
          input_schema: req.jsonSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    },
    req.signal,
  );

  if (!res.ok) {
    const error = asRecord(asRecord(res.json).error);
    throw httpError(res, typeof error.type === 'string' ? error.type : undefined);
  }

  const json = asRecord(res.json);
  const blocks = (Array.isArray(json.content) ? json.content : []).map(asRecord);
  const toolUse = blocks.find((block) => block.type === 'tool_use');
  const raw = toolUse
    ? JSON.stringify(toolUse.input ?? {})
    : blocks
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('');

  if (!raw.trim()) {
    throw new LlmError('invalid_output', 'Provedor LLM devolveu resposta vazia.', {
      providerCode: typeof json.stop_reason === 'string' ? json.stop_reason : undefined,
    });
  }

  const usage = asRecord(json.usage);
  return {
    raw,
    model: typeof json.model === 'string' ? json.model : req.model,
    tokensIn: asNumber(usage.input_tokens),
    tokensOut: asNumber(usage.output_tokens),
  };
};
