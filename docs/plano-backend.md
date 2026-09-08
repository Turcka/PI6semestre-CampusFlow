# Plano de Ação - Backend (Node.js + Express + TypeScript)

Tecnologia: **Node.js 20+ / Express 4 / TypeScript**, conforme RNF-02 ("API de backend em Node.js moderno, com capacidade para processar a lógica complexa de alocação de horários e alto volume de acessos"). Integrações: **Supabase** (banco, auth, storage, filas), **WhatsApp Cloud API**, **SendGrid**, **Mapbox**.

Diretório: [`apps/api/`](../apps/api/). Estrutura por módulos de domínio (`src/modules/*`), integrações isoladas (`src/integrations/*`) e worker de filas (`src/jobs/*`).

---

## Etapa 0 - Bootstrap e fundações

1. `npm install` na raiz (workspaces). Dependências já declaradas em `apps/api/package.json`: `express`, `helmet`, `cors`, `express-rate-limit`, `zod`, `pino`/`pino-http`, `@supabase/supabase-js`, `exceljs`, `multer`, `@sendgrid/mail`, `qrcode`, `swagger-ui-express`; dev: `tsx`, `tsup`, `vitest`, `supertest`, `eslint`.
2. Arquivos já criados: `src/server.ts`, `src/app.ts`, `src/config/{env,logger,supabase}.ts`, `src/middlewares/error.middleware.ts`, `src/utils/app-error.ts`, `src/modules/health`, `src/jobs/worker.ts`.
3. Criar `eslint.config.js` (flat config, `@typescript-eslint`), `vitest.config.ts` e `Dockerfile` multi-stage (build com `tsup`, imagem `node:20-alpine`).
4. Convenções:
   - ESM (`"type": "module"`), imports com extensão `.js`.
   - Resposta de erro `{ error: { code, message, details? } }`; sucesso retorna o recurso direto ou `{ data, page, pageSize, total }`.
   - Rotas: `/api/v1/*` autenticadas, `/api/v1/public/*` públicas com rate limit, `/api/v1/webhooks/*` para provedores.
   - Validação de entrada com zod reaproveitando `@campusflow/shared`.

Entregável: `npm run dev:api` responde `GET /health`; `npm run test` executa um teste de fumaça com supertest.

---

## Etapa 1 - Middlewares transversais

| Middleware | Implementação |
| --- | --- |
| `auth.middleware.ts` | Lê `Authorization: Bearer <jwt>`; valida com `supabase.auth.getUser(jwt)` (ou verificação local do JWT com `SUPABASE_JWT_SECRET` para reduzir latência); carrega `profiles` e anexa `req.user = { id, tenantId, role }` e `req.supabase = createUserClient(jwt)`. |
| `tenant.middleware.ts` | Garante `req.user.tenantId`; rejeita 403 se recurso solicitado pertencer a outro tenant (defesa em profundidade além da RLS). |
| `role.middleware.ts` | `requireRole('admin','secretaria')` retorna 403 caso contrário. |
| `validate.middleware.ts` | `validate({ body?, query?, params? })` com zod; erros viram 422. |
| `rate-limit.middleware.ts` | `express-rate-limit`: 60 req/min por IP em `/public/*`, 300 req/min autenticado; webhooks sem limite mas com verificação de assinatura. |
| `async-handler` | Wrapper para controllers `async` encaminharem exceções ao `errorHandler`. |

Também: `config/openapi.ts` com documento OpenAPI 3 servido em `/docs` (swagger-ui-express); cada módulo registra seus paths.

---

## Etapa 2 - Fase 1: Core Engine

### 2.1 Módulos base: `tenants`, `users`, `courses`, `auth`

- `GET/PATCH /tenants/current`, `GET/POST/PATCH /tenants/current/campuses`.
- `GET /users`, `POST /auth/invite` (usa `supabase.auth.admin.inviteUserByEmail` com `user_metadata: { tenant_id, role, full_name }`), `PATCH /users/:id` (papel, ativo, cursos).
- `GET/POST/PATCH/DELETE /courses`.
- `GET /auth/me` retorna perfil + tenant + permissões.

### 2.2 Módulo `leads` (RF-01)

1. **Importação**: `POST /leads/import` com `multer` (memória, limite 20 MB). Parser CSV (`csv-parse`) e XLSX (`exceljs`). Retorna `importId` + preview classificando linhas em `valid | duplicate | invalid` e salva o arquivo no bucket `lead-imports`.
2. **Higienização** (`leads.hygiene.ts`, puro e testável):
   - Normalizar espaços/caixa; e-mail em minúsculas.
   - Telefone -> E.164 (`+55` + DDD + número; remover máscara; aceitar 10 ou 11 dígitos).
   - Validar e-mail (regex RFC simplificada) e telefone.
   - Deduplicar dentro do arquivo e contra o banco (`email` ou `phone` do tenant), preenchendo `duplicate_of`.
3. **Confirmação**: `POST /leads/import/:importId/confirm` persiste linhas válidas em lote (`upsert` em chunks de 500).
4. **CRUD e listagem**: filtros por curso, origem, status, período, busca textual (`ilike`/trigram); paginação.
5. **Exportação Excel**: `GET /leads/export.xlsx` gera planilha com `exceljs` em stream (`workbook.xlsx.write(res)`), cabeçalhos em português, colunas: nome, e-mail, telefone, curso, origem, status, data de cadastro, última visita. Registrar em `audit_logs`.
6. **Rota pública**: `POST /public/leads` (schema `publicLeadSchema`) usada pelo formulário do candidato; exige `lgpdConsent`.

### 2.3 Módulos `availability` e `scheduling` (RF-02, RF-03)

1. `availability`: `GET/PUT /availability/rules` (substituição completa das regras do coordenador), `GET/POST/DELETE /availability/exceptions`. Coordenador só edita a própria agenda.
2. **Geração de slots** (`scheduling/slot-generator.ts`, puro): a partir de regras + exceções + fuso do tenant, gera `visit_slots` para `[from, to]` sem duplicar (chave `coordinator_id + starts_at`). Executado sob demanda (`POST /scheduling/slots/generate`) e por job diário que mantém 60 dias à frente.
3. **Consulta pública**: `GET /public/scheduling/slots?campusId&courseId&from&to` -> slots abertos com `booked_count < capacity`, de coordenadores vinculados ao curso; respeita antecedência mínima do tenant.
4. **Reserva atômica**: `POST /public/scheduling/visits` chama `supabase.rpc('book_visit', {...})`. Mapear erros: `P0001 SLOT_UNAVAILABLE` -> 409, `P0002 SLOT_NOT_FOUND` -> 404, violação de `visits_no_overlap` (`23P01`) -> 409 `COORDINATOR_BUSY`.
5. `GET /scheduling/visits` (secretaria/coordenador), `PATCH /scheduling/visits/:id/cancel` (decrementa `booked_count`, cancela `message_jobs` futuros), `POST /scheduling/visits/:id/reschedule` (cancela + nova reserva em transação via RPC).

### 2.4 Módulo `calendar` (RF-04)

- O evento `Visita Individual - [Nome do Candidato]` é criado por trigger no banco; a API expõe `GET /calendar/events?from&to`.
- `POST /calendar/events/:id/confirm`: valida que `req.user.id === coordinator_id` (ou admin); atualiza `confirmed_at`; o banco muda a visita para `confirmed` e agenda comunicações; a API publica evento interno `visit.confirmed` (EventEmitter tipado em `utils/events.ts`) para desacoplar módulos.
- `POST /calendar/events/:id/decline` com motivo -> visita `cancelled`, gatilho `visit.declined`.
- `GET /calendar/events/:id/ics` gera arquivo iCalendar.

Entregável da Fase 1: fluxo completo candidato -> reserva -> evento -> confirmação, com testes de concorrência (duas reservas simultâneas no mesmo slot de capacidade 1: apenas uma vence).

---

## Etapa 3 - Fase 2: Mensageria (RF-05)

### 3.1 Integrações

- `integrations/whatsapp/whatsapp.client.ts`: `fetch` para `https://graph.facebook.com/{version}/{phoneNumberId}/messages`; métodos `sendTemplate`, `sendText`, `sendLocation`, `sendDocument`; tratamento de erros da Graph API (código 131047 janela expirada, 131026 número inválido...).
- `integrations/whatsapp/whatsapp.webhook.ts`: `GET /webhooks/whatsapp` (handshake `hub.verify_token`), `POST` com parsing de `entry[].changes[].value.statuses[]` -> atualiza `message_logs` por `provider_message_id`.
- `integrations/sendgrid/sendgrid.client.ts`: `@sendgrid/mail` com `customArgs: { tenant_id, message_log_id }` e `categories: [tenantSlug]`.
- `integrations/sendgrid/sendgrid.webhook.ts`: validação ECDSA da assinatura (`@sendgrid/eventwebhook`), mapeia `delivered/open/click/bounce/dropped`.

### 3.2 Módulo `messaging`

1. CRUD de `templates` com validação das variáveis (`TEMPLATE_VARIABLES`) e preview (`POST /messaging/templates/:id/preview` renderiza com dados fictícios).
2. `GET/PUT /messaging/rules` - régua por gatilho/canal/offset.
3. `template-renderer.ts` (puro): substitui `{{candidato.nome}}` etc.; para WhatsApp gera `components[].parameters` na ordem das variáveis do template aprovado.
4. `POST /messaging/campaigns` - disparo em massa: resolve segmento de leads, cria `message_jobs` com `run_at = scheduled_at`.
5. `GET /messaging/logs` com filtros e agregados.
6. Pesquisa de satisfação: regra `visit.completed` (após check-in ou fim da visita) envia link para formulário com token; `POST /public/surveys/:token`.

### 3.3 Worker (`jobs/worker.ts`)

```
loop:
  msgs = rpc pgmq_read('messages_outbound', vt=60, qty=10)
  para cada msg:
    provider = channel === 'whatsapp' ? whatsapp : sendgrid
    try:
      { providerMessageId } = provider.send(payload)
      insert message_logs status='sent'
      rpc pgmq_archive(msg_id)
    catch err:
      if read_ct >= QUEUE_MAX_RETRIES: message_logs status='failed'; archive
      else: deixa expirar o visibility timeout (retry automático) e loga
```

- Idempotência: `message_logs.job_id` unique; antes de enviar, verificar se já existe log `sent`.
- Métricas do worker em log estruturado (mensagens/min, falhas por provedor).
- `dev:worker`/`start:worker` como processo separado; em produção, escalar horizontalmente.

Entregável da Fase 2: confirmar visita dispara WhatsApp + e-mail em < 1 min; lembrete de véspera enfileirado; status de entrega refletido nos logs via webhooks.

---

## Etapa 4 - Fase 3: Mapa e check-in

1. `map`: CRUD de `pois` (com `poi_photos` via URL assinada de upload no bucket `poi-photos`), `routes` (GeoJSON validado com zod), `itineraries` por curso. `GET /public/map/:campusId` retorna payload consolidado com `Cache-Control: public, max-age=3600` e `ETag`.
2. `integrations/mapbox`: `geocode()` para preencher coordenadas ao cadastrar campus/POI; `directions()` (perfil walking) para pré-calcular rotas entre POIs e salvar `geometry`.
3. `checkin`: ao confirmar visita, gerar QR (`qrcode.toBuffer(url)`) apontando para `/public/checkin/:token`; `POST /checkin/scan` valida token, janela (`starts_at - 60min` a `ends_at + 60min`), marca `checked_in` e insere `checkins`; gatilho `visit.completed` agendado para `ends_at`.
4. Roteiro personalizado: resposta do check-in inclui `itinerary` do curso do lead para o embaixador conduzir o tour.

---

## Etapa 5 - Fase 4: Analytics, billing e ERP

1. `analytics`: endpoints consultam views (`vw_funnel`, `mv_leads_daily`, `vw_messaging_metrics`) com filtros `from/to/campusId`; cache em memória de 60 s por tenant.
2. `billing`: `GET /billing/usage`, `GET /billing/plan`; middleware `enforcePlanLimits` em `POST /leads/import/confirm` e `POST /auth/invite` (coordenador).
3. `analytics/erp/`: interface `ErpConnector { pushEnrollment(lead), pullCourses() }` + adapters `TotvsConnector`, `SophiaConnector` (stubs configuráveis por tenant em `tenants.settings.erp`); job noturno de sincronização.
4. Endpoint `POST /webhooks/erp/:tenantSlug` para receber matrícula efetivada e marcar `leads.status = 'matriculado'` (fecha o funil).

---

## Etapa 6 - Qualidade, segurança e operação

| Área | Ações |
| --- | --- |
| Testes unitários (Vitest) | `leads.hygiene`, `slot-generator`, `template-renderer`, mapeamento de erros do `book_visit`. Meta: > 80% nos módulos puros. |
| Testes de integração | supertest + Supabase local (`supabase start` no CI): fluxo de reserva concorrente, RLS entre tenants, webhooks com payloads reais gravados. |
| Segurança | `helmet`, CORS restrito, rate limit, validação zod em toda entrada, service role nunca exposto, verificação de assinatura nos webhooks, logs sem PII (`redact`). |
| Observabilidade | `pino` JSON + `request-id`; `/health` e `/health/ready` (verifica Supabase); métricas do worker. |
| CI (GitHub Actions) | `lint` -> `typecheck` -> `test` -> `build` em push/PR; job opcional que sobe Supabase para testes de integração. |
| Deploy | Docker (API e worker como serviços separados) em Render/Railway/Fly.io; variáveis via secrets; `supabase db push` no pipeline de release. |
| Documentação | OpenAPI em `/docs`; READMEs por módulo (já criados) atualizados conforme implementação. |

---

## Sequência de implementação (ordem de commits sugerida)

1. Fundações: eslint/vitest/Dockerfile, middlewares `auth`/`tenant`/`role`/`validate`, OpenAPI base.
2. `tenants`, `users`, `courses`, `auth`.
3. `leads` (higienização + import + export).
4. `availability` + `slot-generator` + `scheduling` (com testes de concorrência).
5. `calendar` + eventos internos.
6. Integrações WhatsApp/SendGrid + `messaging` + worker.
7. `map` + `checkin`.
8. `analytics` + `billing` + ERP stubs.
9. Hardening, CI/CD, documentação final.

## Cronograma sugerido

| Semana | Entrega |
| --- | --- |
| 1 | Etapas 0-1 (fundações e middlewares) + módulos base. |
| 2 | `leads` completo com testes. |
| 3-4 | `availability`, `scheduling`, `calendar`; testes de concorrência. |
| 5-6 | Mensageria: integrações, régua, worker, webhooks. |
| 7 | Mapa e check-in. |
| 8 | Analytics, billing, ERP. |
| 9 | Hardening, CI/CD, documentação. |
