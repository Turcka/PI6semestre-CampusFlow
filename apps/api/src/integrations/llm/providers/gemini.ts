import { LlmError, type LlmProvider } from '../llm.types.js';
import { asNumber, asRecord, httpError, postJson } from './http.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini API (generateContent). Usa apenas `responseMimeType: application/json`: o `responseSchema`
 * do Gemini não aceita objetos de chaves livres, como o campo `extracted` do turno.
 */
export const geminiProvider: LlmProvider = async (req) => {
  const baseUrl = (req.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const res = await postJson(
    `${baseUrl}/models/${encodeURIComponent(req.model)}:generateContent`,
    { 'x-goog-api-key': req.apiKey },
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        responseMimeType: 'application/json',
      },
    },
    req.signal,
  );

  if (!res.ok) {
    const error = asRecord(asRecord(res.json).error);
    throw httpError(res, typeof error.status === 'string' ? error.status : undefined);
  }

  const json = asRecord(res.json);
  const candidate = asRecord((Array.isArray(json.candidates) ? json.candidates : [])[0]);
  const parts = asRecord(candidate.content).parts;
  const raw = (Array.isArray(parts) ? parts : [])
    .map(asRecord)
    .filter((part) => typeof part.text === 'string' && part.thought !== true)
    .map((part) => part.text as string)
    .join('');

  if (!raw.trim()) {
    throw new LlmError('invalid_output', 'Provedor LLM devolveu resposta vazia.', {
      providerCode: typeof candidate.finishReason === 'string' ? candidate.finishReason : undefined,
    });
  }

  const usage = asRecord(json.usageMetadata);
  return {
    raw,
    model: typeof json.modelVersion === 'string' ? json.modelVersion : req.model,
    tokensIn: asNumber(usage.promptTokenCount),
    tokensOut: asNumber(usage.candidatesTokenCount) + asNumber(usage.thoughtsTokenCount),
  };
};
