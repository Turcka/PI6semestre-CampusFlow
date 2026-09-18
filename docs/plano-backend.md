# Plano de Ação - Backend (Node.js + Express + TypeScript) - Revisão 2

Tecnologia mantida: **Node.js 20+ / Express 4 / TypeScript** (ESM), **Supabase** (banco, auth, storage, filas `pgmq`), **SendGrid** (e-mail). Integrações que saem do núcleo: WhatsApp Cloud API (evolução futura, §8 do documento), Mapbox (mantido apenas para geocodificação de POIs), ERP Totvs/Sophia (substituído por **Rubeus**).

Fonte dos requisitos: **Documento de Requisitos do Sistema - Plataforma Inteligente para Agendamento e Gestão de Visitas Individuais**, seções 3.1–3.14, 6 e 7. Modelo de dados de referência: [`plano-banco-de-dados.md`](plano-banco-de-dados.md) (Revisão 2).

Diretório: [`apps/api/`](../apps/api/). Estrutura por módulos de domínio (`src/modules/*`), integrações isoladas (`src/integrations/*`) e worker de filas (`src/jobs/*`).

---

## Etapa R0 - Estado atual e estratégia de reajuste

Já implementado e validado (`typecheck` + `vitest` verdes, API sobe com `GET /health`):

- Fundações: `app.ts`, `server.ts`, `config/{env,logger,supabase,openapi}.ts`, middlewares `auth`/`tenant`/`role`/`validate`/`rate-limit`/`error`, `utils/{app-error,async-handler,events}.ts`, Dockerfile, ESLint, Vitest.
- Módulos em [`src/modules/`](../apps/api/src/modules/): `health`, `auth`, `tenants`, `users`, `courses`, `leads`, `availability`, `scheduling`, `calendar`, `messaging`, `map`, `checkin`, `analytics`, `billing`.
- Roteadores: [`routes/v1.ts`](../apps/api/src/routes/v1.ts) (autenticado), [`routes/public.ts`](../apps/api/src/routes/public.ts) (`/leads`, `/scheduling`, `/map`, `/checkin`, `/campuses/:slug`, `/surveys/:token`), [`routes/webhooks.ts`](../apps/api/src/routes/webhooks.ts) (`/whatsapp`, `/sendgrid`, `/erp/:tenantSlug`).
- Integrações: `whatsapp`, `sendgrid`, `mapbox`, `erp`; worker `jobs/worker.ts` consumindo `messages_outbound`.

Estratégia: **evoluir módulos existentes e adicionar os novos**; nada é removido do repositório antes de o substituto estar em produção. Módulos que saem do núcleo são movidos para `src/modules/_legacy/` e deixam de ser montados em `v1.ts`.

### Tabela "legado implementado -> destino"

| Módulo / arquivo atual | Destino |
| --- | --- |
| Fundações, middlewares, OpenAPI, Dockerfile, CI | **Manter**. `requireRole` passa a aceitar `admin`, `promotor`, `professor`. |
| `auth`, `tenants`, `users`, `courses` | **Manter**. `POST /auth/invite` recebe `role in (admin, promotor, professor)` e cria perfil específico. |
| `leads` (`leads.hygiene.ts`, import CSV/XLSX, export Excel, `publicLeadsRouter`) | **Renomear** para `candidates`; importação/higienização/exportação Excel movidas para `_legacy`; rota pública de cadastro reaproveitada como passo 1 do chatbot. |
| `availability` | **Manter**; `coordinatorId` -> `ownerId`; aceita professor; nova exceção `last_minute`. |
| `scheduling` (`slot-generator.ts`, `book_visit`, slots públicos) | **Evoluir**: geração de slots continua; reserva pública passa a chamar `schedule_visit_with_match`; consulta de slots deixa de listar "coordenador" e passa a listar janelas em que **existe promotor elegível**. |
| `calendar` (confirm/decline por coordenador, ICS) | **Evoluir**: confirmação vira `visit_invitations` (módulo `invitations`); listagem ganha filtros por promotor/professor/curso/status e busca por nome/CPF; ICS mantido; exportação da agenda (CSV) adicionada. |
| `messaging` (templates, régua, campanhas, logs, WhatsApp) | **Manter** templates/régua/logs com canal padrão `email` e `audience`; `campaigns` -> `_legacy`; cliente WhatsApp fica no repositório desativado por env. |
| `map` (POIs, rotas, roteiro por curso, mapa público) | **Manter** e estender com `poi_interest_tags` e `promoter_pois`; mapa público sem prioridade. |
| `checkin` (QR, scan, `check_in_visit`) | **Legado** (`_legacy`). Comparecimento vira `PATCH /visits/:id/status`. |
| `analytics` | **Reescrever** consultas sobre as novas views (`vw_visits_kpis`, `vw_reassignment_metrics`, `vw_conversion`, `vw_promoter_performance`, `vw_slot_occupancy`). |
| `billing` + `enforcePlanLimits` | **Legado** (`_legacy`); middleware removido de `invite` e `import`. |
| `integrations/erp` + `POST /webhooks/erp/:tenantSlug` | **Substituir** por `integrations/rubeus` + `POST /webhooks/rubeus`. |
| `integrations/whatsapp` + webhooks | **Desativar** (`WHATSAPP_ENABLED=false`); código mantido para a evolução futura. |
| `jobs/worker.ts` | **Estender**: além de `messages_outbound`, consome `rubeus_outbound`. |
| `packages/shared` (`enums.ts`, `schemas.ts`, `types.ts`) | **Atualizar** enums/DTOs para candidatos, promotores, professores, match, convites e novos status. |

Entregável: API compila com o schema pós-`0010` (renomeações) e os testes antigos ajustados; rotas legadas fora de `v1.ts`.

---

## Etapa R1 - Candidato e chatbot (`modules/candidates`, `modules/chatbot`) - §3.1, §3.2

### `candidates`

- `GET /candidates` (admin): filtros por curso, status, período, `q` (nome, e-mail, **CPF**), paginação.
- `GET /candidates/:id` (admin): dados, perfil comportamental, interesses, resumo, histórico de visitas (`visits` + `visit_status_history`), eventos de conversão.
- `PATCH /candidates/:id` (admin): atualização cadastral; grava `audit_logs`.
- **Público (acesso por token do candidato)** em `/public/candidates`:
  - `POST /` cadastro inicial (`nome, cpf, email, telefone, curso, consentimento LGPD`) -> cria `candidates` + `chatbot_sessions`; retorna `sessionId` e `portalToken`.
  - `GET /me?token=` / `PATCH /me` atualizar dados cadastrais.
  - `GET /me/visits` histórico do candidato.
- Validação: `cpfSchema` (dígitos verificadores) em `@campusflow/shared`; telefone E.164 e e-mail reaproveitam `leads.hygiene.ts` (renomeado `candidates.normalize.ts`).

### `chatbot` (motor de perguntas configurável)

- `GET /public/chatbot/sessions/:id/next` - próxima pergunta com base nas respostas já dadas e no curso (perguntas gerais + específicas do curso), sinaliza `progress` e `isLast`.
- `POST /public/chatbot/sessions/:id/answers` - grava/sobrescreve resposta (`{ questionId, value }`), valida contra `kind`/`options`.
- `GET /public/chatbot/sessions/:id/review` - todas as perguntas e respostas para revisão antes de concluir.
- `POST /public/chatbot/sessions/:id/complete` - chama `build_candidate_profile`; retorna resumo, interesses e foco identificados; marca sessão `completed`.
- Admin: `GET/POST/PATCH/DELETE /chatbot/questions` (com `audience`, `courseId`, `options` -> interesses/traits), `POST /chatbot/questions/reorder`, `GET /chatbot/interest-categories` CRUD.
- `chatbot/profile-builder.ts` (puro, testável): função que recebe respostas + perguntas e devolve `{ interests, traits, focus, summary }` - espelho em TypeScript da lógica SQL para preview no admin e testes.

---

## Etapa R2 - Promotores e professores (`modules/promoters`, `modules/professors`) - §3.3, §3.7

### `promoters`

- `GET /promoters` (admin) com desempenho resumido; `GET /promoters/:id` (admin ou o próprio).
- `PUT /promoters/me/profile` - bio, traits (via questionário: `POST /promoters/me/questionnaire` reutiliza o motor do chatbot com `audience = 'promotor'`), foco preferido, cursos com familiaridade, interesses, POIs aptos (`promoter_pois`), `maxVisitsPerDay`, `acceptsAutoMatch`.
- Disponibilidade: reutiliza `availability` (`GET/PUT /availability/rules`, exceções). `POST /availability/exceptions` com `kind = 'last_minute'` dispara o reencaminhamento (trigger no banco) e a API devolve o resultado (`reassigned`, `noSubstitute`).
- `GET /promoters/me/visits?status&from&to` - visitas convocadas/confirmadas com briefing.
- `GET /promoters/me/history` - visitas realizadas, taxa de comparecimento, remanejamentos.

### `professors`

- `PUT /professors/me/profile` - área, temas, cursos, `acceptsVisits`, `isSubstitute`.
- `GET /professors/me/requests` - solicitações de participação pendentes.
- `GET /professors/me/visits`.
- Admin: `GET/POST/PATCH/DELETE /professors/requirement-rules` (quando a presença do professor é obrigatória/recomendada por curso, foco ou interesse).

Admin pode editar disponibilidade e perfil de qualquer promotor/professor (`PUT /availability/rules?ownerId=`), registrando em `audit_logs` (§3.14.1).

---

## Etapa R3 - Motor de match (`modules/match`) - §3.4, §7

- `match/scoring.ts` (**puro**, sem I/O): `scorePromoter(candidateProfile, promoterProfile, weights, context) -> { score, breakdown, eligible, reasons }`. Critérios: `course_affinity`, `interest_overlap` (Jaccard ponderado por `score`/`level`), `behavioral_similarity` (1 - distância média entre traits), `focus_alignment`, `service_experience`, `workload_balance` (visitas do dia / `maxVisitsPerDay`), `rating`. Critérios `mandatory` abaixo de `min_score` tornam o promotor inelegível; `tiebreaker` só entra em empate.
- `match/justification.ts` (puro): transforma `breakdown` em frase legível ("92% - curso compatível, 3 interesses em comum...").
- `match/match.service.ts`: orquestra `rpc('run_promoter_match')`; **a mesma fórmula vive no SQL** (fonte da verdade para atomicidade) e o TypeScript é usado para preview/explicação e testes de paridade (fixture compartilhada em `tests/fixtures/match/*.json`).
- Rotas admin:
  - `GET /match/weights`, `PUT /match/weights` (pesos, tipo, mínimo) - alteração registra `audit_logs`.
  - `POST /match/preview` - `{ candidateId, window }` -> ranking sem persistir (para o admin entender/simular).
  - `GET /match/runs/:id` - ranking completo com justificativa e fila reserva.
  - `POST /visits/:id/assign` - match manual (`assign_visit_manually`) quando o algoritmo não encontra opção adequada.

Testes: fixtures determinísticas (candidato "carros + tecnologia + foco técnico" deve ranquear o promotor de Engenharia Automotiva em 1º; promotor sem disponibilidade nunca elegível; empate resolvido por carga do dia).

---

## Etapa R4 - Agendamento, convites e reencaminhamento (`modules/scheduling`, `modules/visits`, `modules/invitations`) - §3.5, §3.6, §3.12

### Público (candidato, via `portalToken`)

- `GET /public/scheduling/windows?candidateId&from&to` - janelas em que **existe ao menos um promotor elegível** (interseção `availability_windows` do candidato x `visit_slots` de promotores compatíveis com o curso), agrupadas por dia.
- `POST /public/scheduling/visits` - `{ candidateId, window }` -> `schedule_visit_with_match`; resposta inclui status inicial (`aguardando_promotor`), horário e, se aplicável, aviso de que um professor foi solicitado. Erros: `PROFILE_INCOMPLETE` 409, `NO_ELIGIBLE_PROMOTER` 409 (com sugestão de outras janelas), `23P01` -> 409 `PARTICIPANT_BUSY`.
- `POST /public/scheduling/visits/:id/reschedule` - valida `min_hours_to_reschedule`; chama `reschedule_visit`.
- `POST /public/scheduling/visits/:id/cancel` - valida `min_hours_to_cancel`; chama `cancel_visit`.
- `GET /public/scheduling/visits/:id` - situação da visita (status, promotor - apenas primeiro nome -, horário, campus, instruções).
- Substitui `POST /public/scheduling/visits` atual (`book_visit`) e a listagem de slots por coordenador.

### `invitations` (promotor e professor autenticados)

- `GET /invitations/me?status=pending` - convocações/solicitações com `expiresAt`, dados resumidos do candidato (sem CPF/contato) e roteiro sugerido.
- `POST /invitations/:id/accept` / `POST /invitations/:id/decline` (`{ reason }`) -> `respond_invitation`; resposta informa o novo status da visita. Recusa dispara reencaminhamento no banco; a API publica evento interno `visit.reassigned` (EventEmitter em `utils/events.ts`) para logging/observabilidade.

### `visits` (admin + participantes)

- `GET /visits` - filtros: status, curso, promotor, professor, campus, período, `q` (nome/CPF); paginação; inclui `pendingIssues` (sem promotor, aguardando professor, conflito).
- `GET /visits/:id` - detalhe completo: candidato, match selecionado (score + justificativa), convites, reencaminhamentos, histórico de status, notas, roteiro, mensagens enviadas.
- `PATCH /visits/:id/status` - `em_atendimento`, `realizada`, `ausente` (promotor da visita ou admin); admin pode qualquer transição com `reason`.
- `POST /visits` (admin) - visita manual: escolhe candidato, janela e, opcionalmente, promotor/professor (pula o match).
- `POST /visits/:id/assign` (admin) - substituição manual de promotor/professor.
- `POST /visits/:id/cancel`, `POST /visits/:id/reschedule` (admin, ignora antecedência mínima com `override: true` auditado).
- `POST /visits/:id/notes` / `GET /visits/:id/notes` - observações antes/durante/depois (promotor ou admin).
- `GET /visits/:id/briefing` - informativo do promotor (§3.8): perfil, interesses, dúvidas, POIs recomendados, professor recomendado.

### Regras e políticas

- `GET/PUT /scheduling/policies` (admin): antecedência mínima para cancelar/reagendar por foco, timeout de convite, máximo de remanejamentos, duração padrão.
- `POST /scheduling/slots/generate` mantido; job diário mantém 60 dias de slots para promotores **e** professores.

---

## Etapa R5 - Roteiro, calendário e central de pendências (`modules/map`, `modules/calendar`, `modules/admin`) - §3.8, §3.9, §3.14

### Roteiro personalizado (`map` estendido)

- CRUD de POIs ganha `interestTags: [{ categoryId, relevance }]`; `GET /map/pois?interest=carros`.
- `POST /visits/:id/itinerary/regenerate` -> `generate_visit_itinerary`; `PUT /visits/:id/itinerary` para o promotor/admin ajustar ordem e itens manualmente.
- Mapbox `geocode()` mantido para cadastrar coordenadas; `directions()` deixa de ser chamado no fluxo principal.

### Calendário operacional (`calendar` evoluído)

- `GET /calendar/events?view=day|week|month&from&to&courseId&promoterId&professorId&status&q` - retorna horário, candidato, curso, promotor, professor, status, `hasConflict`, `pendingApproval`.
- `GET /calendar/agenda/:profileId?from&to` - agenda de um promotor ou professor (admin).
- `GET /calendar/export.csv?from&to&...` - exportação administrativa (registra `audit_logs`).
- `GET /calendar/events/:id/ics` mantido (inclui professor como participante).

### Central de pendências e administração (`admin`)

- `GET /admin/pending-issues` -> `vw_pending_issues` (visitas sem promotor, aguardando professor, convites prestes a expirar, conflitos, alertas críticos).
- `GET /admin/alerts`, `POST /admin/alerts/:id/resolve`.
- `GET /admin/audit-logs?entity&actorId&from&to` - histórico de intervenções manuais e decisões automáticas.
- Configurações centralizadas: pesos do match (`match`), perguntas do chatbot (`chatbot`), regras de professor (`professors`), políticas (`scheduling`), bloqueios de datas/promotores (`availability` com `ownerId`).

---

## Etapa R6 - Notificações por e-mail (`modules/messaging`, `integrations/sendgrid`, `jobs/worker.ts`) - §3.13

- Régua padrão (seeds em `communication_rules`, canal `email`, por `audience`):
  - Candidato: `visit.scheduled` (recebido), `visit.confirmed` (com nome do promotor, horário, orientações e link do portal), `reminder.day_before`, `reminder.hour_before`, `visit.cancelled`, `visit.rescheduled`, `promoter.reassigned` (só quando a troca altera a visita de forma relevante).
  - Promotor: `promoter.invited` (com link aceitar/recusar e prazo), `visit.confirmed` (briefing), `visit.cancelled`, `visit.rescheduled`, lembrete de véspera.
  - Professor: `professor.requested`, `visit.confirmed`, `visit.cancelled`.
  - Admin: `admin.no_substitute`, `admin.visit_unattended` (alertas imediatos).
- `template-renderer.ts` mantido; novas variáveis em `TEMPLATE_VARIABLES` (`promotor.nome`, `professor.nome`, `visita.link_aceite`, `candidato.resumo`, `visita.roteiro`).
- Deduplicação: worker respeita `message_jobs.dedupe_key`; alterações sucessivas cancelam o job anterior antes de enfileirar o novo.
- `GET /notifications/preferences` / `PUT` - tipos de notificação por perfil (`notification_preferences`).
- WhatsApp: cliente e webhook permanecem, mas `WHATSAPP_ENABLED=false` impede seleção do canal; documentado como evolução futura.
- `GET /messaging/logs` mantido; `campaigns` sai de `v1.ts`.

---

## Etapa R7 - Integração Rubeus (`integrations/rubeus`, `modules/conversion`) - §3.11

- `integrations/rubeus/rubeus.client.ts`: `upsertContact(candidate)`, `registerVisit(visit)`, `getConversionStatus(trackingCode | rubeusContactId)`; autenticação por token em env (`RUBEUS_BASE_URL`, `RUBEUS_API_TOKEN`, `RUBEUS_ORIGIN_ID`); mapeamento de campos configurável em `tenants.settings.rubeus.fieldMap`.
- `integrations/rubeus/rubeus.webhook.ts`: `POST /webhooks/rubeus` com validação de assinatura/segredo -> `conversion_events (source = 'rubeus')`; evento de matrícula marca `candidates.status = 'matriculado'`.
- Worker consome a fila `rubeus_outbound` (alimentada por `rubeus_outbox`): envia cadastro do candidato e resultado da visita (`realizada`/`ausente`) com `tracking_code`; retries com backoff; falhas registradas em `rubeus_links.last_error`.
- Job noturno `rubeus:pull-conversions` (cron do worker) para tenants sem webhook: consulta status dos candidatos com visita realizada nos últimos 180 dias.
- `modules/conversion`: `GET /conversion/candidates/:id`, `POST /conversion/candidates/:id/mark-enrolled` (manual, auditado), `GET /analytics/conversion` (por curso, período, faixa de compatibilidade, foco).
- Substitui `integrations/erp` e `POST /webhooks/erp/:tenantSlug`.

---

## Etapa R8 - Dashboard e indicadores (`modules/analytics`) - §3.10

Endpoints (admin), todos com filtros `from`, `to`, `campusId`, `courseId`, `promoterId`, `status`:

| Endpoint | Fonte |
| --- | --- |
| `GET /analytics/overview` | `vw_visits_kpis`: agendadas, confirmadas, realizadas, ausentes, canceladas, reagendadas; taxas de comparecimento, cancelamento, reagendamento. |
| `GET /analytics/visits-by-course`, `/visits-by-promoter` | `vw_visits_kpis` agregada. |
| `GET /analytics/occupancy` | `vw_slot_occupancy`. |
| `GET /analytics/reassignments` | `vw_reassignment_metrics` (quantidade, motivos, sem substituto). |
| `GET /analytics/promoters` | `vw_promoter_performance`. |
| `GET /analytics/conversion` | `vw_conversion` (visitante -> aluno). |
| `GET /analytics/timeseries?metric=` | `mv_visits_daily`. |

Cache em memória de 60 s por tenant + filtros (mantido). Endpoints antigos de leads/funil de captação/mensageria saem do núcleo (mensageria fica como `GET /analytics/messaging` secundário).

---

## Etapa R9 - Worker, qualidade e operação

### Worker (`jobs/worker.ts`)

```
loop:
  emails = queue_read('messages_outbound', 60, 10)  -> sendgrid.send -> message_logs
  rubeus = queue_read('rubeus_outbound', 60, 10)    -> rubeus.client -> rubeus_links / rubeus_outbox.status
  a cada 60s: rpc expire_pending_invitations()      -> fallback caso o pg_cron esteja desabilitado
```

- Idempotência por `message_logs.job_id` (mantida) e `rubeus_outbox.id`.
- Script `dev:worker` na raiz do monorepo (hoje só existe em `apps/api`).

### Testes

| Tipo | Cobertura |
| --- | --- |
| Unitários (Vitest) | `scoring.ts` e `justification.ts` (fixtures determinísticas e paridade com o SQL), `profile-builder.ts`, `cpfSchema`, `slot-generator` (owner promotor/professor), `template-renderer` (novas variáveis), mapeamento de erros das RPCs. |
| Integração (supertest + Supabase local) | Fluxo completo: cadastro -> chatbot -> perfil -> agendamento com match -> convite -> aceite -> confirmação -> e-mail enfileirado; recusa/expiração -> reencaminhamento -> fila reserva -> alerta sem substituto; `EXCLUDE` promotor e professor sob concorrência; RLS de promotor/professor não enxergando visitas alheias nem CPF. |
| Contrato | OpenAPI regenerado em `/docs` com todos os módulos novos; snapshot no CI. |

### Segurança e operação

- Rotas públicas do candidato exigem `portalToken` (header `X-Candidate-Token`), rate limit por IP e por token; nenhum dado de terceiros retornado.
- `helmet`, CORS, zod em toda entrada, service role restrito ao servidor, logs sem PII (`redact` inclui `cpf`).
- Auditoria: todo endpoint admin de intervenção manual passa por `audit.middleware.ts` (grava `audit_logs` com diff).
- Observabilidade: `/health/ready` verifica Supabase e SendGrid; métricas do worker por fila.
- CI: `lint` -> `typecheck` -> `test` -> `build`; job com Supabase local para integração. Deploy Docker (API e worker) como hoje.

---

## Sequência de implementação

1. Reajuste pós-`0010`: renomeações (`leads` -> `candidates`, `coordinatorId` -> `promoterId`/`ownerId`), novos enums em `@campusflow/shared`, módulos legados fora de `v1.ts`, `requireRole` com novos papéis; testes antigos verdes.
2. `candidates` + `chatbot` (público e admin) + `profile-builder`.
3. `promoters` + `professors` + `availability` com `ownerId` e `last_minute`.
4. `match` (scoring puro, preview, pesos, testes de paridade).
5. `scheduling` público novo + `invitations` + `visits` (status, notas, manual, políticas) + testes de concorrência e reencaminhamento.
6. `map` (tags de interesse, roteiro por visita, briefing) + `calendar` (filtros, exportação) + `admin` (pendências, alertas, auditoria).
7. `messaging` e-mail-first (régua por `audience`, dedupe, preferências) + worker.
8. `rubeus` (client, webhook, outbox, pull) + `conversion`.
9. `analytics` sobre as novas views.
10. Hardening, OpenAPI, CI, documentação dos módulos.

## Cronograma revisado

| Semana | Entrega |
| --- | --- |
| 1 | Passo 1 (reajuste ao schema `0010`) + `candidates`/`chatbot`. |
| 2 | `promoters`, `professors`, disponibilidade por `ownerId`. |
| 3 | `match` com testes de paridade e preview para o admin. |
| 4–5 | Agendamento com match, convites, reencaminhamento, políticas, status e notas; testes de concorrência. |
| 6 | Roteiro/briefing, calendário operacional, central de pendências, auditoria. |
| 7 | Notificações por e-mail (régua completa, dedupe, preferências) e worker. |
| 8 | Rubeus e conversão; analytics. |
| 9 | Hardening, OpenAPI, CI/CD, documentação. |
