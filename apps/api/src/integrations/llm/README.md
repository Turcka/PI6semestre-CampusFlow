# llm

Cliente de LLM usado pelo secretário virtual (`modules/chatbot/assistant`). Usa `fetch` nativo, sem SDK.

- `llm.client.ts` — `generateStructured({ system, messages, schema, jsonSchema, ... })`: chama o provedor, extrai o
  JSON da resposta e valida com zod. Prazo de `LLM_TIMEOUT_MS`, uma nova tentativa em falhas transitórias e erro
  tipado `LlmError(kind)` (`timeout`, `rate_limited`, `provider`, `invalid_output`, `disabled`). `isLlmEnabled()` informa
  se há `LLM_ENABLED=true` e chave configurada.
- `providers/` — adaptadores `openai`, `openai_compatible` (qualquer servidor com `/chat/completions`, via
  `LLM_BASE_URL`), `anthropic` e `gemini`.
- Os logs registram provedor, modelo, latência e tokens; nunca o conteúdo das mensagens.

Variáveis (`apps/api/.env`): `LLM_ENABLED`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`,
`LLM_TIMEOUT_MS`, `LLM_MAX_TURNS`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_SESSION_TOKEN_BUDGET`. Com `LLM_ENABLED=false` nada
aqui é chamado e o chatbot funciona só pelo questionário por botões.
