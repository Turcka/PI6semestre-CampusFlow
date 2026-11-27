# chatbot

Coleta do perfil do visitante (candidato) e do promotor. O candidato pode responder de dois modos, guardados em
`chatbot_sessions.mode`:

- `guided` — questionário por botões (`/next` + `/answers`). É o padrão e o fallback: sempre funciona.
- `llm` — conversa com o secretário virtual (`/messages`). Só é usado quando `LLM_ENABLED=true`, há `LLM_API_KEY`
  e `tenants.settings.assistant.enabled = true`.

Nos dois modos as respostas vão para `chatbot_answers` e o perfil é gerado pela RPC `build_candidate_profile`.

## Rotas públicas (`/api/v1/public/chatbot`)

- `GET /sessions/:id/next`, `POST /sessions/:id/answers`, `GET /sessions/:id/review`, `POST /sessions/:id/complete` —
  questionário e conclusão. Aceitam `X-Candidate-Token` (ou `?portalToken=`); sem token ainda funcionam, com token
  errado respondem `403`.
- `GET /sessions/:id/messages` — histórico da conversa; gera a saudação na primeira chamada.
- `POST /sessions/:id/messages { content }` — um turno da conversa. Resposta: `reply`, `quickReplies`, `progress`,
  `done`, `turnsLeft` e, se a LLM falhar ou um limite for atingido, `fallback { mode: "guided", reason }`.
- `POST /sessions/:id/mode { mode }` — troca entre `llm` e `guided` (`409 ASSISTANT_UNAVAILABLE` se a LLM não puder
  ser usada).
- As três últimas exigem o token do candidato (`401` sem token, `403` com token de outro candidato) e as de
  mensagens têm limite de 20 requisições por minuto por sessão.

## Secretário virtual (`assistant/`)

- `assistant.service.ts` — orquestra o turno: mascara PII, monta o prompt, chama a LLM, valida a saída e grava.
  Também gera a saudação, troca de modo e a síntese (`synthesize`, chamada por `completeSession`).
- `prompt.ts` — prompts de turno e de síntese. `extraction.ts` — valida o JSON da LLM contra as perguntas pendentes.
- `pii.ts` — mascara CPF, e-mail e telefone. `settings.ts` — lê `tenants.settings.assistant` com defaults.
- `assistant.repository.ts` — acesso ao banco (service role). `insights.ts` — leitura de `candidates.ai_insights`.

Regras que o código garante:

- A LLM não tem ferramentas nem acesso ao banco: só devolve JSON, validado com zod.
- Só chegam ao provedor o primeiro nome, o curso, o campus, os fatos cadastrados pelo admin e o texto do chat com
  PII mascarada. CPF, e-mail e telefone do cadastro nunca são enviados.
- Só são gravados valores que existem nas `options` da pergunta (ou escala 1–5, ou texto livre mascarado). O resto é
  descartado e fica registrado em `chatbot_messages.extracted.rejected`.
- Erro do provedor, timeout, saída inválida, limite de turnos ou de tokens levam a sessão para `guided`
  (`fallback_reason`), mantendo as respostas já gravadas.
- O conteúdo das mensagens não vai para os logs.

## Dados gerados

- `chatbot_messages` — transcrição (PII mascarada). Leitura só pelo admin do tenant (RLS); apagada 180 dias após a
  conclusão. `GET /api/v1/candidates/:id/transcript` (admin) devolve a última sessão.
- `candidates.ai_insights` — prioridades, dúvidas, objetivos, estágio de decisão etc. Aparece no briefing da visita
  (`GET /api/v1/visits/:id/briefing` → `candidate.aiInsights`) e em `GET /api/v1/analytics/priorities`.
- Configuração por tenant em `GET/PATCH /api/v1/tenants/current/settings`.

## Testes e avaliação

- `npm test --workspace apps/api` — testes unitários de `pii`, `extraction`, `prompt` e do orquestrador (LLM simulada).
- `node scripts/llm-eval.mjs` — roteiros de conversa contra a API em execução com a LLM ligada; mede obrigatórias
  respondidas, turnos, fallbacks e tokens, e apaga os candidatos de teste ao final.
