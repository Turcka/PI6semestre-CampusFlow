# Sprint 1 — Correções Estruturais, Governança e Regras Core

> Prioridade: **Alta**. Fonte: relatório de análise funcional do CampusFlow, seção 6 (roadmap) e tabelas 4.1 / 4.2.
> Este documento é um roteiro de execução passo a passo. Cada épico traz o estado atual do código, os arquivos a tocar, os passos na ordem DB → API → Web → Validação, critérios de aceite e um prompt sugerido para pedir ajuda à IA.

## Sumário

1. [Objetivo e escopo](#1-objetivo-e-escopo)
2. [Estado atual do código (achados)](#2-estado-atual-do-código-achados)
3. [Pré-requisitos e convenções](#3-pré-requisitos-e-convenções)
4. [E1 — Navegação global (top navbar, logo, botão Voltar)](#4-e1--navegação-global)
5. [E2 — Controle de presença nas Pendências](#5-e2--controle-de-presença-nas-pendências)
6. [E3 — Clique no calendário do Admin abre Drawer com as visitas](#6-e3--calendário-do-admin-com-drawer)
7. [E4 — Moderação: Expulsar e Banir](#7-e4--moderação-expulsar-e-banir)
8. [E5 — Travas do promotor: 1 visita/dia, 18+, foto e questionário](#8-e5--travas-do-promotor)
9. [Ordem de execução sugerida](#9-ordem-de-execução-sugerida)
10. [Checklist de encerramento da sprint](#10-checklist-de-encerramento-da-sprint)
11. [Riscos e decisões em aberto](#11-riscos-e-decisões-em-aberto)

---

## 1. Objetivo e escopo

Entregar as correções de fluxo e as regras de negócio consideradas críticas:

- Menu superior global fixo, logo com link para a tela inicial e botão de retorno na Central de pendências.
- Seletor de status **Presente / Ausente** diretamente nas Pendências e ação de clique nas datas do calendário administrativo.
- Rotinas de moderação **Expulsar** (DELETE físico com histórico preservado) e **Banir** (bloqueio lógico com revogação de sessão).
- Travas do promotor: limite de 1 visita por dia, maioridade (18+), upload de foto visível ao Admin e questionário comportamental obrigatório antes de entrar no match.

Fora do escopo desta sprint (ficam para as próximas): integração Outlook, calendário visual estilo Google para promotores, cron de validade semestral, temas e refinamento do painel docente.

---

## 2. Estado atual do código (achados)

Levantamento feito no repositório em 21/10/2026. Use como referência para não refazer o que já existe.

### Navegação / layout

- [apps/web/src/app/layouts/AppLayout.tsx](../../apps/web/src/app/layouts/AppLayout.tsx): sidebar fixa à esquerda no desktop (`aside … hidden md:flex`, `w-64`); no mobile, header sticky + **bottom nav** com até 5 itens (`items.slice(0, 5)`). O logo é um `<p>` sem link (linhas ~32 e ~63). Itens de navegação no array `NAV` (linhas 9–21).
- [apps/web/src/app/layouts/PublicLayout.tsx](../../apps/web/src/app/layouts/PublicLayout.tsx): header com branding estático, sem link.
- [apps/web/src/app/router.tsx](../../apps/web/src/app/router.tsx): `/` renderiza `HomePage`; `/app` (index) redireciona por papel via `homeForRole` em [AuthProvider.tsx](../../apps/web/src/features/auth/AuthProvider.tsx) (admin → `/app/pendencias`, promotor → `/app/convocacoes`, professor → `/app/solicitacoes`).
- [apps/web/src/features/pendencies/PendingIssuesPage.tsx](../../apps/web/src/features/pendencies/PendingIssuesPage.tsx): sem botão Voltar; o `PageHeader` só tem a ação "Ver todas as visitas". Já possui o formulário "Resolver pendência" (promotor + professor) que chama `POST /visits/:id/resolve`.
- [apps/web/src/components/ui/index.tsx](../../apps/web/src/components/ui/index.tsx): `PageHeader({ title, description?, actions? })`. **Não existe** `Modal`, `Drawer` ou `Dialog`. Exports: `Button, Input, Textarea, Select, Label, FieldError, Card, Badge, EmptyState, Skeleton, ScoreBar, Stepper, PageHeader, Spinner`.

### Calendário admin

- [apps/web/src/features/calendar/CalendarPage.tsx](../../apps/web/src/features/calendar/CalendarPage.tsx): grade mensal; clicar no dia faz `setSelectedDay(key)` e renderiza a lista **inline abaixo da grade** (não há modal/drawer). Dados de `GET /calendar/events?from&to`.
- [apps/api/src/modules/calendar/calendar.service.ts](../../apps/api/src/modules/calendar/calendar.service.ts) `listEvents`: devolve `calendar_events` + `visits` + `candidates` aninhados e adiciona `promoterName`, `professorName`, `pendingApproval`, `hasConflict`.

### Status de visita / presença

- Enum `visit_status`: `agendada, aguardando_promotor, aguardando_professor, confirmada, em_atendimento, realizada, ausente, cancelada, reagendada` ([0010_pivot_rename.sql](../../supabase/migrations/0010_pivot_rename.sql) ~171).
- `PATCH /api/v1/visits/:id/status` (admin ou promotor) com `setVisitStatusSchema` aceitando `em_atendimento | realizada | ausente | confirmada | cancelada` ([visits.schemas.ts](../../apps/api/src/modules/visits/visits.schemas.ts)).
- RPC `set_visit_status` ([0014_visits_invitations.sql](../../supabase/migrations/0014_visits_invitations.sql) ~751–796): **admin não tem restrição de transição**; promotor só `confirmada → em_atendimento|ausente` e `em_atendimento → realizada`. Grava `completed_at` / `absent_marked_at`.
- `listVisits` em [visits.service.ts](../../apps/api/src/modules/visits/visits.service.ts) calcula `pendingIssues` (`sem_promotor`, `aguardando_professor`, `convite_pendente`).
- Módulo de check-in está em `_legacy` e a RPC `check_in_visit` lança `CHECKIN_LEGACY_DISABLED`. A presença deve usar `set_visit_status`.

### Usuários / moderação

- `profiles` ([0003_tenancy.sql](../../supabase/migrations/0003_tenancy.sql) ~75–86): `id` (FK `auth.users` **ON DELETE CASCADE**), `tenant_id, full_name, email, phone, role, avatar_url, is_active, created_at, updated_at`. **Não existe** `is_banned`, `banned_at`, `birth_date`.
- Endpoints: `GET /users`, `PATCH /users/:id` (`role, isActive, courseIds, fullName`) em [users.routes.ts](../../apps/api/src/modules/users/users.routes.ts); `POST /auth/users`, `POST /auth/invite`, `GET /auth/me` em [auth.routes.ts](../../apps/api/src/modules/auth/auth.routes.ts). **Não existe** DELETE de usuário nem `PATCH /auth/me`.
- [auth.middleware.ts](../../apps/api/src/middlewares/auth.middleware.ts): valida o JWT com `admin.auth.getUser(token)`, carrega o profile a cada request e devolve 403 se `!is_active`. Isso significa que qualquer flag em `profiles` tem efeito imediato na próxima requisição.
- FKs para `profiles(id)` relevantes para "expulsar com histórico": `visits.promoter_id` **RESTRICT** (bloqueia delete), `calendar_events.promoter_id` CASCADE, `visit_invitations.profile_id` CASCADE (NOT NULL), `visit_notes.author_id` CASCADE, `match_results.promoter_id` CASCADE (NOT NULL, unique `(run_id, promoter_id)`), `chatbot_sessions.profile_id` CASCADE. Já são SET NULL: `visits.professor_id`, `calendar_events.professor_id`, `visit_reassignments.*`, `visit_status_history.changed_by`, `admin_alerts.resolved_by`, `match_runs.requested_by`, `visit_itinerary_items.added_by`. `audit_logs.actor_id` não tem FK.
- RLS em `profiles`: `profiles_update_self` (só o próprio) e `profiles_admin_write` (admin do tenant) — [0010_pivot_rename.sql](../../supabase/migrations/0010_pivot_rename.sql) ~134–140.
- [SettingsPage.tsx](../../apps/web/src/features/settings/SettingsPage.tsx): lista read-only de usuários + formulário de criação com chips de curso. Sem ações por usuário.

### Promotor

- `promoter_profiles` ([0012_promoters_professors.sql](../../supabase/migrations/0012_promoters_professors.sql) ~13–25): `bio, traits jsonb, preferred_focus[], experience_level, max_visits_per_day (default 3), accepts_auto_match, rating_avg, visits_completed, no_show_count, updated_at`. Sem colunas de onboarding, validade do teste ou data de nascimento.
- Match vivo: `run_promoter_match` em [0018_fix_match_slot_check.sql](../../supabase/migrations/0018_fix_match_slot_check.sql). O WHERE (linhas ~65–90) exige: `p.is_active`, `pp.accepts_auto_match`, slot aberto com início/fim exatos, nenhuma visita ativa sobreposta, vínculo em `promoter_courses`. `max_visits_per_day` entra **apenas** no critério `workload_balance` (tiebreaker); **não há cap rígido** de visitas/dia.
- `assign_visit_manually` ([0014](../../supabase/migrations/0014_visits_invitations.sql) ~799–859): só checa se o ator é admin; não valida conflito, slot, curso ou limite diário. É a RPC usada por `POST /visits/:id/assign` e `POST /visits/:id/resolve`.
- `listPublicWindows` em [scheduling.service.ts](../../apps/api/src/modules/scheduling/scheduling.service.ts) (~108–209) lista slots abertos de promotores vinculados ao curso do candidato; não considera limite diário.
- Questionário de promotor: existe **só no SQL** (`build_promoter_profile` em 0012 ~139–224, lê `chatbot_answers` e grava `promoter_profiles.traits` + `promoter_interests`). `chatbot_sessions.audience` aceita `'promotor'`. Não há perguntas `audience = 'promotor'` no [seed.sql](../../supabase/seed.sql), nem rota de API, nem tela web.
- O fluxo do candidato é a referência: [ChatbotConversation.tsx](../../apps/web/src/features/chatbot/ChatbotConversation.tsx) consome `GET /public/chatbot/sessions/:id/next`, `POST …/answers`, `GET …/review`, `POST …/complete` ([chatbot.routes.ts](../../apps/api/src/modules/chatbot/chatbot.routes.ts)); o service ([chatbot.service.ts](../../apps/api/src/modules/chatbot/chatbot.service.ts)) usa `audience 'candidato'` fixo e `completeSession` chama `build_candidate_profile`.
- Foto: só `profiles.avatar_url`; buckets existentes: `poi-photos`, `tenant-assets`, `lead-imports` ([0007_map.sql](../../supabase/migrations/0007_map.sql) ~216). Nenhum upload no web.
- Perfil do promotor no web ([ProfilePages.tsx](../../apps/web/src/features/profiles/ProfilePages.tsx) `PromoterProfilePage`): edita `bio, maxVisitsPerDay, acceptsAutoMatch` via `PUT /promoters/me/profile`.
- Seed ([scripts/seed-users.mjs](../../scripts/seed-users.mjs)): promotor demo com `max_visits_per_day: 6`, sem `traits`.

### Erros de RPC

- [apps/api/src/utils/map-rpc-error.ts](../../apps/api/src/utils/map-rpc-error.ts) traduz mensagens (`NO_ELIGIBLE_PROMOTER`, `INVALID_TRANSITION`, `FORBIDDEN`…) para `AppError`. Novos códigos de erro SQL precisam ser mapeados aqui.

---

## 3. Pré-requisitos e convenções

- Ambiente: `npm run dev` (API :3333 + web :5173). Migrações via `npm run db:migrate` (script [scripts/db.mjs](../../scripts/db.mjs), requer `SUPABASE_DB_URL` no `.env` da raiz). Última migração existente: `0018_fix_match_slot_check.sql`; **esta sprint começa em `0019`**.
- Typecheck: `npm run typecheck --workspace @campusflow/web` e `npm run typecheck --workspace @campusflow/api` (ou o script equivalente em cada `package.json`).
- Teste manual da API: o padrão usado neste projeto é um script Node que faz `signInWithPassword` com `admin@campusflow.local / CampusFlow123!` e chama a API com o Bearer. Vale criar `scripts/dev-call.mjs` reutilizável (método, path, body) para acelerar as validações desta sprint.
- Não imprimir segredos do `.env` em logs/terminal.
- Padrão de código: zod em `*.schemas.ts`, service em `*.service.ts`, controller com `asyncHandler`, rotas com `requireRole` + `validate`. No web: TanStack Query com chaves em [query-keys.ts](../../apps/web/src/lib/query-keys.ts), componentes de UI em `components/ui/index.tsx`.
- Mensagens e UI em português.

---

## 4. E1 — Navegação global

### Objetivo

Menu principal padronizado e fixo no topo em todas as telas autenticadas, logo clicável para a tela inicial e botão "Voltar" na Central de pendências.

### Arquivos

- [apps/web/src/app/layouts/AppLayout.tsx](../../apps/web/src/app/layouts/AppLayout.tsx)
- [apps/web/src/app/layouts/PublicLayout.tsx](../../apps/web/src/app/layouts/PublicLayout.tsx)
- [apps/web/src/components/ui/index.tsx](../../apps/web/src/components/ui/index.tsx)
- [apps/web/src/features/pendencies/PendingIssuesPage.tsx](../../apps/web/src/features/pendencies/PendingIssuesPage.tsx)
- [apps/web/src/features/visits/VisitsPages.tsx](../../apps/web/src/features/visits/VisitsPages.tsx) (VisitDetailPage também ganha Voltar)

### Passos

1. **Criar `TopNav`** em `apps/web/src/app/layouts/TopNav.tsx`:
   - `<header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">`.
   - Esquerda: logo `CampusFlow` como `<Link to={homeHref}>`. Para usuário autenticado `homeHref = '/app'` (o index de `/app` já redireciona para a home do papel); para público `'/'`. Esse é o comportamento equivalente a "rota inicial" para cada contexto.
   - Centro/direita: itens de `NAV` filtrados por papel como `NavLink` horizontais (`hidden md:flex`), com estado ativo (`bg-brand-50 text-brand-700`).
   - Direita: nome do usuário, papel e botão Sair.
   - Mobile: botão hambúrguer que abre um painel (reutilize o `Drawer` do E3; se o E1 for feito antes, implemente o `Drawer` aqui e o E3 o reaproveita).
2. **Refatorar `AppLayout`** para usar `TopNav` e remover a sidebar `w-64`. Ajustar `main` para `mx-auto max-w-7xl px-4 py-6 md:px-8`. Decidir se a bottom nav mobile permanece; recomendação: manter a bottom nav com até 5 itens para mobile e o hambúrguer para o restante, evitando perda de acesso a rotas em telas pequenas.
3. **`PublicLayout`**: transformar o branding em `<Link to="/">`.
4. **Botão Voltar reutilizável**:
   - Em `components/ui/index.tsx` criar `BackButton({ fallback }: { fallback: string })` usando `useNavigate()`; se `window.history.state?.idx > 0` chama `navigate(-1)`, senão `navigate(fallback)`.
   - Estender `PageHeader` com prop opcional `backTo?: string` que renderiza o `BackButton` acima do título.
5. **Aplicar** `backTo="/app"` no `PageHeader` da `PendingIssuesPage` e `backTo="/app/visitas"` na `VisitDetailPage`.
6. **Acessibilidade**: `aria-label="Voltar"`, `aria-current="page"` nos `NavLink` ativos, foco visível.

### Validação

- `npm run typecheck --workspace @campusflow/web`.
- Navegar logado como admin, promotor e professor: o menu correto aparece no topo em todas as rotas `/app/*`; logo leva à home do papel; em `/` (público) leva à landing.
- Em Pendências, "Voltar" retorna à tela anterior; abrindo direto pela URL, cai em `/app`.
- Redimensionar para < 768px: hambúrguer e/ou bottom nav funcionando; nenhum item inacessível.

### Critérios de aceite

- Nenhuma tela autenticada sem o menu superior.
- Logo clicável em layouts público e autenticado.
- Botão Voltar presente em Pendências e no detalhe da visita.

### Prompt sugerido

> "Implemente o E1 do arquivo docs/sprints/sprint-1-correcoes-governanca-regras-core.md: crie TopNav, refatore AppLayout removendo a sidebar, adicione BackButton e a prop backTo no PageHeader, aplique em PendingIssuesPage e VisitDetailPage. Rode o typecheck do web ao final."

---

## 5. E2 — Controle de presença nas Pendências

### Objetivo

Permitir que o admin marque rapidamente **Presente** (`realizada`) ou **Ausente** (`ausente`) nas visitas do dia, direto na Central de pendências, e que visitas sem presença registrada apareçam como pendência.

### Decisão de modelagem

Não criar coluna nova de presença. O enum `visit_status` já expressa o resultado (`realizada` / `ausente`) e a RPC `set_visit_status` já grava `completed_at` / `absent_marked_at`. O que falta é: (a) classificar como pendência a visita confirmada cujo horário já passou sem desfecho, e (b) UI de alternância.

### Arquivos

- [apps/api/src/modules/visits/visits.service.ts](../../apps/api/src/modules/visits/visits.service.ts) (`listVisits`)
- [apps/api/src/modules/visits/visits.schemas.ts](../../apps/api/src/modules/visits/visits.schemas.ts)
- [apps/web/src/features/pendencies/PendingIssuesPage.tsx](../../apps/web/src/features/pendencies/PendingIssuesPage.tsx)
- [apps/web/src/features/visits/VisitsPages.tsx](../../apps/web/src/features/visits/VisitsPages.tsx) (`AdminVisitsPage`)
- [apps/web/src/lib/format.ts](../../apps/web/src/lib/format.ts) (`parseTstzrange` já existe no web; criar equivalente na API)

### Passos

1. **API — nova pendência `presenca_pendente`** em `listVisits`:
   - Criar util `apps/api/src/utils/tstzrange.ts` com `parseTstzrange(period: string): { start: Date; end: Date } | null` (o formato vindo do Postgres é `["2026-10-16 19:00:00+00","2026-10-16 20:00:00+00")`).
   - No `map` que monta `pendingIssues`, adicionar: se `status in ('confirmada','em_atendimento')` e `period.start <= now()` → `pendingIssues.push('presenca_pendente')`.
   - Adicionar filtro opcional `pending=presenca` ao `listVisitsQuerySchema` (opcional; o web pode filtrar em memória como já faz).
2. **API — endpoint de presença explícito** (opcional, mas deixa a intenção clara e evita expor transições arbitrárias ao front): `POST /visits/:id/presence` com body `{ present: boolean }` que chama `setVisitStatus(req, id, { status: present ? 'realizada' : 'ausente', reason: 'Presença registrada pelo administrador' })`. Reaproveita `setVisitStatusSchema`. Alternativa mínima: usar diretamente `PATCH /visits/:id/status`.
3. **API — desfazer**: admin pode voltar para `confirmada` via o mesmo `PATCH /visits/:id/status` (a RPC não restringe admin). Documentar no README do módulo.
4. **Web — `PendingIssuesPage`**:
   - Novo grupo `presenca_pendente` ("Presença a registrar") com cards contendo nome, horário, promotor e um `Select` ou par de botões **Presente / Ausente**.
   - Mutation `presenceMutation` → `POST /visits/:id/presence` (ou `PATCH …/status`). Em `onSuccess`, invalidar `['visits']` e `['calendar']`.
   - Exibir feedback de sucesso e erro (`ApiError.message`).
   - Para visitas já com desfecho hoje (`realizada` / `ausente`), oferecer "Desfazer" que volta para `confirmada` (útil para erro de clique).
5. **Web — `AdminVisitsPage`**: coluna "Presença" com o mesmo controle para linhas `confirmada` / `em_atendimento` (reutilizar um componente `PresenceToggle` em `features/visits/PresenceToggle.tsx`).
6. **Dashboard**: nada a mudar; `vw_visits_kpis` já conta `realizadas` e `ausentes`.

### Validação

- Script Node: confirmar uma visita (usar `/visits/:id/resolve` do fluxo atual), ajustar o `period` para o passado se necessário via SQL, chamar `GET /visits` e verificar `presenca_pendente`; chamar `POST /visits/:id/presence` com `present: true` e depois `false`; conferir `status`, `completed_at`, `absent_marked_at`.
- UI: o card aparece no grupo "Presença a registrar"; ao marcar, some do grupo; Dashboard reflete.

### Critérios de aceite

- Visitas confirmadas com horário já iniciado aparecem nas Pendências até terem presença registrada.
- Alternância Presente/Ausente em 1 clique, com desfazer.
- Registro auditável (`visit_status_history` já é alimentado pela trigger existente de status).

### Prompt sugerido

> "Implemente o E2 (presença) conforme docs/sprints/sprint-1-…md: util parseTstzrange na API, pendingIssues 'presenca_pendente' em listVisits, rota POST /visits/:id/presence, componente PresenceToggle e grupo 'Presença a registrar' na PendingIssuesPage. Valide com um script Node logando como admin."

---

## 6. E3 — Calendário do Admin com Drawer

### Objetivo

Ao clicar em uma data do calendário administrativo, abrir um **Drawer** lateral (ou modal no mobile) com a relação de visitas do dia, com ações rápidas.

### Arquivos

- [apps/web/src/components/ui/index.tsx](../../apps/web/src/components/ui/index.tsx) → novo arquivo `apps/web/src/components/ui/Drawer.tsx` re-exportado no index
- [apps/web/src/features/calendar/CalendarPage.tsx](../../apps/web/src/features/calendar/CalendarPage.tsx)
- (reuso) `PresenceToggle` do E2

### Passos

1. **Componente `Drawer`** (`apps/web/src/components/ui/Drawer.tsx`):
   - Props: `open, onClose, title, children, side?: 'right' | 'bottom', width?`.
   - Render em portal (`createPortal` em `document.body`), overlay `bg-slate-900/40`, painel `fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl` (em `< sm`, `side='bottom'` com `max-h-[85vh]`).
   - Fecha com `Esc`, clique no overlay e botão X. `role="dialog" aria-modal="true" aria-labelledby`.
   - Trava scroll do body enquanto aberto; devolve foco ao elemento que abriu.
   - Exportar em `components/ui/index.tsx`.
2. **`CalendarPage`**:
   - Trocar a lista inline por `Drawer open={!!selectedDay} onClose={() => setSelectedDay(null)}` com título `format(day, "EEEE, dd 'de' MMMM")`.
   - Conteúdo: lista ordenada por `starts_at` com horário em destaque, nome do candidato, promotor, professor, `Badge` de status e ações: "Abrir visita" (`/app/visitas/:id`), "Resolver" (link para Pendências com `?visit=:id`, ou formulário inline reaproveitando o seletor de promotor/professor) e `PresenceToggle` quando aplicável.
   - Navegação por dias dentro do Drawer (setas ‹ › mudam `selectedDay` em ±1 dia).
   - Estado inicial: `selectedDay = null` (hoje não abre automaticamente; o número de visitas no dia já é mostrado na célula).
   - Manter o `useMemo` do intervalo (já corrigido anteriormente) para evitar refetch infinito.
3. **Célula do dia**: `aria-label` com "dd de MMMM, N visitas"; destaque de hoje; cursor pointer.

### Validação

- Clicar em um dia com visitas abre o Drawer com a lista; dias vazios mostram `EmptyState` dentro do Drawer.
- `Esc` e overlay fecham; foco retorna à célula.
- Ações levam às rotas corretas; presença marcada no Drawer atualiza a célula (invalidate `['calendar']`).

### Critérios de aceite

- Nenhuma lista inline residual; Drawer funcional no desktop e mobile.
- Drawer reutilizável (será usado em E1 mobile, E4 confirmações e Sprint 2).

### Prompt sugerido

> "Implemente o E3: componente Drawer acessível em components/ui e use-o na CalendarPage para listar as visitas do dia clicado, com ações Abrir visita, Resolver e PresenceToggle."

---

## 7. E4 — Moderação: Expulsar e Banir

### Objetivo

- **Banir**: bloqueio lógico (`is_banned = true`, `banned_at`, motivo), bloqueio imediato de acesso, exclusão do promotor/professor de qualquer alocação futura, retenção total de histórico.
- **Expulsar**: exclusão física do usuário (Auth + `profiles`) preservando histórico de visitas, auditoria e relatórios via `ON DELETE SET NULL`.

### Arquivos

- Nova migração `supabase/migrations/0019_moderation.sql`
- [apps/api/src/middlewares/auth.middleware.ts](../../apps/api/src/middlewares/auth.middleware.ts)
- [apps/api/src/modules/users/users.routes.ts](../../apps/api/src/modules/users/users.routes.ts), `users.schemas.ts`, `users.service.ts`, `users.controller.ts`
- [apps/api/src/utils/map-rpc-error.ts](../../apps/api/src/utils/map-rpc-error.ts)
- [apps/web/src/features/settings/SettingsPage.tsx](../../apps/web/src/features/settings/SettingsPage.tsx)
- [apps/web/src/features/pendencies/PendingIssuesPage.tsx](../../apps/web/src/features/pendencies/PendingIssuesPage.tsx) (filtrar banidos nos selects)
- [scripts/seed-users.mjs](../../scripts/seed-users.mjs) (nada obrigatório; opcional criar um usuário banido para teste)

### Passos — Banco (`0019_moderation.sql`)

1. Colunas em `profiles`:
   ```sql
   alter table public.profiles
     add column if not exists is_banned  boolean not null default false,
     add column if not exists banned_at  timestamptz,
     add column if not exists banned_by  uuid references public.profiles(id) on delete set null,
     add column if not exists ban_reason text;
   create index if not exists profiles_banned_idx on public.profiles (tenant_id) where is_banned;
   ```
2. **FKs de histórico → SET NULL** (para o Expulsar não apagar histórico nem ser bloqueado):
   - `visits.promoter_id`: `drop constraint …_fkey; add constraint … references profiles(id) on delete set null;` (hoje RESTRICT).
   - `calendar_events.promoter_id`: CASCADE → SET NULL.
   - `visit_notes.author_id`: CASCADE → SET NULL.
   - `match_results.promoter_id`: tornar nullable, CASCADE → SET NULL; trocar a unique `(run_id, promoter_id)` por índice único parcial `where promoter_id is not null`.
   - `visit_invitations.profile_id`: tornar nullable, CASCADE → SET NULL.
   - Manter CASCADE em dados operacionais do próprio usuário: `promoter_profiles`, `professor_profiles`, `promoter_courses`, `professor_courses`, `availability_rules`, `availability_exceptions`, `visit_slots`, `notification_preferences`, `chatbot_sessions`.
   - Antes de alterar, listar os nomes reais das constraints com `select conname from pg_constraint where conrelid = 'public.visits'::regclass;` e usar `drop constraint if exists`.
3. **Helper de elegibilidade** usado pelo match e pelas atribuições manuais:
   ```sql
   create or replace function public.profile_can_be_assigned(p_profile_id uuid)
   returns boolean language sql stable as $$
     select p.is_active and not p.is_banned
     from public.profiles p where p.id = p_profile_id
   $$;
   ```
4. **Match e atribuição**: `create or replace` de `run_promoter_match` (copiar o corpo de 0018 e acrescentar `and not p.is_banned` no WHERE), de `find_available_professor` (idem) e de `assign_visit_manually` (no início: `if not public.profile_can_be_assigned(p_profile_id) then raise exception 'PROFILE_NOT_ASSIGNABLE' using errcode = 'P0001'; end if;`). Como o E5 também altera essas funções, escreva a versão final única em `0019` + `0020` na ordem em que forem executadas, sempre copiando o corpo mais recente.
5. **Função de banimento** (faz tudo numa transação):
   ```sql
   create or replace function public.ban_profile(p_profile_id uuid, p_actor uuid, p_reason text)
   returns void language plpgsql security definer set search_path = public as $$
   begin
     -- somente admin do mesmo tenant
     update public.profiles set is_banned = true, banned_at = now(), banned_by = p_actor,
            ban_reason = p_reason, is_active = false where id = p_profile_id;
     update public.visit_invitations set status = 'cancelled'
       where profile_id = p_profile_id and status = 'pending';
     update public.visit_slots set is_open = false
       where owner_id = p_profile_id and starts_at > now() and booked_count = 0;
     -- visitas futuras ativas: disparar reassign_visit (já existe em 0014) para cada uma
     insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
       select tenant_id, p_actor, 'profile.ban', 'profiles', id::text,
              jsonb_build_object('reason', p_reason) from public.profiles where id = p_profile_id;
   end $$;
   ```
   Criar também `unban_profile(p_profile_id, p_actor)` revertendo `is_banned/is_active` (slots voltam a abrir apenas por regeneração).
6. **Preparo do expulsar** `prepare_profile_removal(p_profile_id, p_actor)`: cancela convites pendentes, chama `reassign_visit` para visitas futuras em que o usuário é promotor/professor, grava `audit_logs` (`profile.expel`) **antes** do delete (o `actor_id`/`entity_id` são texto/uuid sem FK, então sobrevivem).

### Passos — API

1. `users.schemas.ts`: `banUserSchema = z.object({ reason: z.string().trim().min(3).max(500) })`; `userIdParamsSchema` já existe.
2. `users.service.ts`:
   - `banUser(req, id, input)`: validar que `id !== req.user.id`, carregar profile do tenant, chamar `admin.rpc('ban_profile', …)` com `getAdminClient()`; depois `admin.auth.admin.updateUserById(id, { ban_duration: '87600h' })` (≈10 anos) para o Supabase Auth recusar novos logins/refresh. O middleware já derruba o acesso na próxima requisição porque `is_active` ficou `false` (acrescentar também um check explícito `is_banned` → 403 `USER_BANNED`, para a mensagem ser clara).
   - `unbanUser`: RPC `unban_profile` + `updateUserById(id, { ban_duration: 'none' })`.
   - `deleteUser(req, id)`: bloquear auto-exclusão e exclusão do último admin ativo do tenant; `admin.rpc('prepare_profile_removal')`; `admin.auth.admin.deleteUser(id)` (o CASCADE de `profiles.id → auth.users` remove o profile; FKs SET NULL preservam histórico). Retornar 204.
3. `users.routes.ts`: `POST /:id/ban`, `POST /:id/unban`, `DELETE /:id` — todos `requireRole('admin')`.
4. `auth.middleware.ts`: selecionar também `is_banned`; se `true` → `AppError.forbidden('Conta banida.')` com código `USER_BANNED`.
5. `listUsers`: incluir `is_banned, banned_at, avatar_url` no select; filtro `isBanned` opcional.
6. `map-rpc-error.ts`: mapear `PROFILE_NOT_ASSIGNABLE` → 409 "Usuário inativo ou banido não pode ser alocado."
7. Nas listas de staff usadas para alocação (`PendingIssuesPage` consome `GET /users?pageSize=100`): o front deve filtrar `is_active && !is_banned`; a API pode aceitar `?assignable=true` que aplica esse filtro.

### Passos — Web (`SettingsPage`)

1. Linha de usuário com avatar (quando houver), nome, e-mail, papel, chips "inativo" / "banido (motivo)".
2. Menu de ações: **Banir** (abre `Drawer`/modal com campo motivo obrigatório + confirmação), **Desbanir**, **Expulsar** (confirmação em duas etapas: digitar o e-mail do usuário para habilitar o botão vermelho). Nunca mostrar Expulsar/Banir para o próprio usuário logado.
3. Mutations para `POST /users/:id/ban`, `POST /users/:id/unban`, `DELETE /users/:id`; invalidar `queryKeys.users()`.
4. Em `PendingIssuesPage` e demais selects de promotor/professor, filtrar banidos/inativos.

### Validação

- SQL: após migrar, `\d public.visits` mostra `promoter_id` com `ON DELETE SET NULL`.
- Script: criar usuário promotor via `POST /auth/users`; bani-lo; tentar login com `signInWithPassword` (deve falhar com user banned) e chamada com token antigo (403 `USER_BANNED`); `GET /visits` do admin segue funcionando; tentar `POST /visits/:id/assign` com o banido → 409.
- Expulsar: criar promotor, atribuir a uma visita passada (histórico), expulsar; `GET /visits/:id` continua existindo com `promoter_id = null`; `audit_logs` tem `profile.expel`; usuário sumiu de `GET /users` e do Auth.
- Tentar expulsar a si mesmo → 400; expulsar o último admin → 409.

### Critérios de aceite

- Banido perde acesso imediatamente e nunca aparece em alocação/match.
- Expulso é removido do Auth e de `profiles`, com histórico (visitas, notas, auditoria, relatórios) intacto.
- Ações auditadas em `audit_logs`.

### Prompt sugerido

> "Implemente o E4 (moderação) do plano da Sprint 1: migração 0019_moderation.sql (colunas de ban, FKs SET NULL, funções ban_profile/unban_profile/prepare_profile_removal, filtro not is_banned no match), rotas POST /users/:id/ban, /unban e DELETE /users/:id, check de is_banned no auth.middleware, e ações Banir/Desbanir/Expulsar com confirmação na SettingsPage."

---

## 8. E5 — Travas do promotor

### Objetivo

Garantir que só promotores aptos entrem na alocação: no máximo **1 visita por dia**, **maior de 18 anos**, **foto cadastrada** visível ao Admin e **questionário comportamental concluído**. Preparar os campos de validade do teste (6 meses) que a Sprint 2 usará no cron.

### Arquivos

- Nova migração `supabase/migrations/0020_promoter_guards.sql`
- [supabase/seed.sql](../../supabase/seed.sql) (perguntas `audience = 'promotor'`)
- [apps/api/src/modules/auth/*](../../apps/api/src/modules/auth) (`PATCH /auth/me`, `getMe` com status de onboarding, `createUserSchema` com `birthDate`)
- [apps/api/src/modules/promoters/*](../../apps/api/src/modules/promoters) (rotas de onboarding)
- [apps/api/src/modules/chatbot/chatbot.service.ts](../../apps/api/src/modules/chatbot/chatbot.service.ts) (parametrizar audience)
- [apps/api/src/modules/scheduling/scheduling.service.ts](../../apps/api/src/modules/scheduling/scheduling.service.ts) (`listPublicWindows` respeitando limite diário)
- [apps/api/src/utils/map-rpc-error.ts](../../apps/api/src/utils/map-rpc-error.ts)
- [packages/shared/src/schemas.ts](../../packages/shared/src/schemas.ts) (`birthDateSchema`, regra de 18 anos compartilhada)
- Web: [router.tsx](../../apps/web/src/app/router.tsx), [AuthProvider.tsx](../../apps/web/src/features/auth/AuthProvider.tsx), [ProfilePages.tsx](../../apps/web/src/features/profiles/ProfilePages.tsx), nova `features/onboarding/PromoterOnboardingPage.tsx`, [ChatbotConversation.tsx](../../apps/web/src/features/chatbot/ChatbotConversation.tsx), [SettingsPage.tsx](../../apps/web/src/features/settings/SettingsPage.tsx)
- [scripts/seed-users.mjs](../../scripts/seed-users.mjs)

### 8.1 Banco (`0020_promoter_guards.sql`)

1. **Colunas**:
   ```sql
   alter table public.profiles add column if not exists birth_date date;
   alter table public.promoter_profiles
     add column if not exists onboarding_completed_at         timestamptz,
     add column if not exists behavioral_test_completed_at    timestamptz,
     add column if not exists behavioral_test_expires_at      timestamptz,
     add column if not exists onboarding_session_id           uuid references public.chatbot_sessions(id) on delete set null;
   alter table public.promoter_profiles alter column max_visits_per_day set default 1;
   update public.promoter_profiles set max_visits_per_day = 1;  -- regra: 1 visita/dia
   ```
2. **Função de aptidão** (centraliza as quatro travas):
   ```sql
   create or replace function public.promoter_is_eligible(p_profile_id uuid)
   returns boolean language sql stable as $$
     select p.is_active and not p.is_banned
        and p.birth_date is not null and p.birth_date <= (current_date - interval '18 years')
        and p.avatar_url is not null
        and pp.onboarding_completed_at is not null
        and (pp.behavioral_test_expires_at is null or pp.behavioral_test_expires_at > now())
     from public.profiles p join public.promoter_profiles pp on pp.profile_id = p.id
     where p.id = p_profile_id
   $$;
   ```
   Opcional: função `promoter_eligibility_report(p_profile_id)` retornando jsonb com cada item (`adult`, `photo`, `questionnaire`, `test_valid`) para a API mostrar o que falta.
3. **Limite diário** — trigger em `visits` (cobre match, `assign_visit_manually`, `resolve`, reagendamento):
   ```sql
   create or replace function public.enforce_promoter_daily_limit() returns trigger
   language plpgsql as $$
   declare v_tz text; v_day date; v_count int; v_max int;
   begin
     if new.promoter_id is null or new.status in ('cancelada','reagendada','realizada','ausente') then return new; end if;
     select t.timezone into v_tz from public.tenants t where t.id = new.tenant_id;
     v_day := (lower(new.period) at time zone v_tz)::date;
     select coalesce(pp.max_visits_per_day, 1) into v_max from public.promoter_profiles pp where pp.profile_id = new.promoter_id;
     select count(*) into v_count from public.visits v
       where v.promoter_id = new.promoter_id and v.id <> new.id
         and v.status in ('agendada','aguardando_promotor','aguardando_professor','confirmada','em_atendimento')
         and (lower(v.period) at time zone v_tz)::date = v_day;
     if v_count >= v_max then
       raise exception 'PROMOTER_DAILY_LIMIT' using errcode = 'P0001',
         hint = format('Promotor já possui %s visita(s) em %s', v_count, v_day);
     end if;
     return new;
   end $$;
   drop trigger if exists trg_visits_promoter_daily_limit on public.visits;
   create trigger trg_visits_promoter_daily_limit
     before insert or update of promoter_id, period, status on public.visits
     for each row execute function public.enforce_promoter_daily_limit();
   ```
4. **Match**: `create or replace function public.run_promoter_match` copiando o corpo vigente (0018 + ajuste do E4) e acrescentando no WHERE:
   ```sql
   and public.promoter_is_eligible(p.id)
   and (
     select count(*) from public.visits v
     where v.promoter_id = p.id
       and v.status in ('agendada','aguardando_promotor','aguardando_professor','confirmada','em_atendimento')
       and (lower(v.period) at time zone v_tz)::date = (lower(p_window) at time zone v_tz)::date
   ) < pp.max_visits_per_day
   ```
   (`v_tz` já deve existir no corpo; se não, buscar de `tenants`.)
5. **`assign_visit_manually`**: além do check do E4, validar `promoter_is_eligible` quando `p_role = 'promotor'` (lança `PROMOTER_NOT_ELIGIBLE` com `hint` do relatório). O limite diário já será barrado pela trigger.
6. **Questionário**: garantir que `build_promoter_profile` (0012) ao concluir também grave `onboarding_completed_at = now()`, `behavioral_test_completed_at = now()`, `behavioral_test_expires_at = now() + interval '6 months'`, `onboarding_session_id`. Fazer `create or replace` da função com esses updates ao final.
7. **Trigger de maioridade** (defesa em profundidade; a validação principal é no zod):
   ```sql
   create or replace function public.check_promoter_adult() returns trigger language plpgsql as $$
   begin
     if new.role = 'promotor' and new.birth_date is not null
        and new.birth_date > (current_date - interval '18 years') then
       raise exception 'PROMOTER_UNDERAGE' using errcode = 'P0001';
     end if;
     return new;
   end $$;
   create trigger trg_profiles_promoter_adult before insert or update of birth_date, role on public.profiles
     for each row execute function public.check_promoter_adult();
   ```
8. **Storage — bucket `avatars`**: `insert into storage.buckets (id, name, public) values ('avatars','avatars', true) on conflict do nothing;` + políticas em `storage.objects`: insert/update/delete quando `bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text`; select público (bucket público) ou restrito ao tenant via signed URL (decisão em 11). Tamanho máximo e tipos permitidos ficam no `supabase/config.toml` (`[storage.buckets.avatars] file_size_limit = "2MiB" allowed_mime_types = ["image/jpeg","image/png","image/webp"]`).
9. **Seed de perguntas** em `seed.sql`: 6 a 8 perguntas `audience = 'promotor'` espelhando as de candidato (mesmas chaves de `traits` e `interests` para que `_match_behavioral_similarity` e `interest_overlap` comparem grandezas equivalentes). Ex.: `estilo_comunicacao` (single_choice → traits), `areas_dominio` (multi_choice → interests), `ritmo_tour` (scale), `foco_preferido` (single_choice → `preferred_focus`). Ajustar `build_promoter_profile` para também preencher `preferred_focus` a partir das opções com `focus`.

### 8.2 API

1. **Shared**: em `packages/shared/src/schemas.ts` criar `birthDateSchema = z.string().date()` e `isAdult(birthDate: string, min = 18): boolean`. Exportar.
2. **Criação/edição de usuários**:
   - `createUserSchema` (auth): `birthDate` obrigatório quando `role === 'promotor'` (`superRefine` com `isAdult`). Persistir em `profiles.birth_date`.
   - `updateUserSchema` (users): aceitar `birthDate`, `phone`, `avatarUrl`.
3. **Autoatendimento `PATCH /auth/me`** (`auth.routes.ts` + `auth.service.ts`): schema `updateMeSchema = { fullName?, phone?, birthDate?, avatarUrl? }`; atualiza `profiles` com o client do usuário (política `profiles_update_self` já permite). Para `avatarUrl`, aceitar apenas caminhos do bucket `avatars` do próprio usuário (`^${userId}/`), devolvendo a URL pública montada no backend.
4. **`GET /auth/me`**: incluir `profile.birth_date`, `profile.avatar_url`, e para promotor `onboarding: { completed: boolean, missing: ('birth_date'|'adult'|'photo'|'questionnaire')[], testExpiresAt }` usando `promoter_eligibility_report` ou cálculo em TS.
5. **Onboarding do promotor** — novas rotas em `promoters.routes.ts` (`requireRole('promotor')`):
   - `POST /promoters/me/onboarding/session` → cria `chatbot_sessions` (`audience 'promotor'`, `profile_id = user.id`, `channel 'web'`) se não houver uma `in_progress`; retorna `{ sessionId }`.
   - `GET /promoters/me/onboarding/session/:id/next`, `POST …/answers`, `GET …/review`, `POST …/complete` reutilizando `getNextQuestion/saveAnswer/reviewSession` do `chatbot.service.ts` após **parametrizar o `audience`** (hoje fixo em `'candidato'` em `getSessionQuestions`). `complete` chama `build_promoter_profile` e devolve o novo `onboarding`.
   - Validar que a sessão pertence ao `user.id`.
6. **`listPublicWindows`** (candidato escolhendo horário): após montar os slots, buscar visitas ativas dos promotores no intervalo e **remover os slots dos dias em que o promotor já atingiu `max_visits_per_day`**; também remover promotores com `promoter_is_eligible = false` (consultar via RPC ou replicar o filtro na query de `profiles`). Assim o calendário do candidato só mostra horários que o match aceitará.
7. **`map-rpc-error.ts`**: `PROMOTER_DAILY_LIMIT` → 409 "Promotor já possui visita neste dia."; `PROMOTER_NOT_ELIGIBLE` → 409 com `hint`; `PROMOTER_UNDERAGE` → 422 "Promotor deve ter 18 anos ou mais."
8. **`GET /users` e `GET /promoters/:id`**: expor `avatar_url`, `birth_date`, `onboarding_completed_at`, `behavioral_test_expires_at` para o Admin.

### 8.3 Web

1. **Upload de foto** (`features/profiles/AvatarUploader.tsx`): `<input type="file" accept="image/*" capture="user">`; redimensionar no cliente para 512px (canvas) e enviar com `supabase.storage.from('avatars').upload(\`${userId}/avatar.webp\`, blob, { upsert: true })` (o web já tem o client em `lib/supabase`); depois `PATCH /auth/me { avatarUrl }`. Pré-visualização e remoção.
2. **`PromoterProfilePage`**: adicionar data de nascimento (bloqueada após preenchimento, com texto "para alterar, fale com a administração"), foto (`AvatarUploader`), e um painel "Status para alocação" com checklist (maioridade, foto, questionário, validade do teste) vindo de `me.onboarding`.
3. **`PromoterOnboardingPage`** em `/app/onboarding` (papel promotor): passos **Dados pessoais** (data de nascimento + foto) → **Questionário** (reaproveitar `ChatbotConversation` tornando a base da URL configurável: hoje usa `publicApi`; aceitar prop `endpointBase` ou função `request`) → **Revisão** → **Concluído**. Ao concluir, invalidar `queryKeys.me` e redirecionar para `/app/convocacoes`.
4. **Guard de rota**: em `router.tsx`, componente `RequirePromoterOnboarding` envolvendo as rotas do promotor (exceto `/app/onboarding` e `/app/meu-perfil`): se `me.profile.role === 'promotor' && !me.onboarding?.completed` → `Navigate to="/app/onboarding"`. Banner persistente no `TopNav` quando faltar algo.
5. **Admin**: `SettingsPage` mostra avatar e um chip "Apto / Pendente (o que falta)" para promotores; `PendingIssuesPage` lista no `Select` apenas promotores aptos e exibe a foto ao lado do nome (miniatura 24px).
6. **Mensagem de erro** `PROMOTER_DAILY_LIMIT` nas telas de resolver/atribuir e no `WindowPicker` do candidato (quando o 409 vier do agendamento).

### 8.4 Seed e dados de desenvolvimento

- `scripts/seed-users.mjs`: promotor demo com `birth_date: '1998-05-10'`, `max_visits_per_day: 1`, `onboarding_completed_at`, `behavioral_test_completed_at = now`, `behavioral_test_expires_at = now + 6 meses`, `traits` coerentes com as perguntas, e `avatar_url` apontando para um placeholder enviado ao bucket (ou URL pública estática em `apps/web/public/`). Sem isso, o promotor demo deixa de ser elegível e o agendamento do candidato para de funcionar em dev.
- `supabase/seed.sql`: perguntas de promotor (item 8.1.9). Aplicar com `npm run db:seed` (verificar que os inserts são idempotentes: `on conflict (tenant_id, key) do update`).

### Validação

- Migração aplica sem erro; `select promoter_is_eligible('<promotor demo>')` → `true` após o seed.
- Script: criar promotor novo via `POST /auth/users` sem `birthDate` → 422; com 17 anos → 422; com 20 anos → 201. Logar como ele: `GET /auth/me.onboarding.completed === false`; `GET /invitations/me` funciona mas o front redireciona para `/app/onboarding`.
- Onboarding completo via API (session → next/answers → complete): `promoter_profiles.traits` preenchido, `onboarding_completed_at` e `behavioral_test_expires_at` setados; `GET /auth/me.onboarding.completed === true` após foto.
- Limite diário: agendar duas visitas para o promotor demo no mesmo dia; a segunda deve falhar com 409 `PROMOTER_DAILY_LIMIT` no match (e o `WindowPicker` do candidato não deve nem oferecer o segundo horário daquele dia). `POST /visits/:id/resolve` para o mesmo promotor no mesmo dia → 409.
- Admin vê a foto na lista de usuários e no seletor das Pendências.
- Regressão: fluxo completo do candidato (`/visita/sao-caetano`) continua agendando com o promotor demo.

### Critérios de aceite

- Nenhum promotor sem onboarding completo (18+, foto, questionário) recebe convite ou aparece no calendário do candidato.
- Nenhum promotor acumula mais de 1 visita ativa por dia, por qualquer caminho (match, atribuição manual, resolver, reagendar).
- Admin enxerga a foto e o status de aptidão.
- Campos `behavioral_test_completed_at` / `behavioral_test_expires_at` prontos para o cron da Sprint 2.

### Prompt sugerido

> "Implemente o E5 do plano da Sprint 1 em etapas: (1) migração 0020_promoter_guards.sql com colunas, promoter_is_eligible, trigger de limite diário, match atualizado e bucket avatars; (2) PATCH /auth/me, birthDate no createUserSchema, rotas de onboarding do promotor reutilizando o chatbot.service com audience parametrizado, filtro em listPublicWindows; (3) AvatarUploader, PromoterOnboardingPage, guard de rota e ajustes em PromoterProfilePage/SettingsPage/PendingIssuesPage; (4) seed.sql e seed-users.mjs. Valide cada etapa com typecheck e scripts Node."

---

## 9. Ordem de execução sugerida

1. **E3 (Drawer) → E1 (TopNav + Voltar)**: o Drawer é reutilizado no menu mobile, nas confirmações do E4 e no calendário. Entrega visual rápida, sem risco no banco. (1–2 dias)
2. **E2 (presença)**: pequeno, backend + UI, destrava o uso diário do admin. (0,5–1 dia)
3. **E4 (moderação)**: primeira migração (`0019`). Fazer com banco de desenvolvimento e backup; testar o Expulsar num usuário descartável. (2 dias)
4. **E5 (travas do promotor)**: maior épico; segunda migração (`0020`). Executar na ordem banco → API → seed → web, validando o agendamento do candidato ao final de cada etapa. (3–4 dias)

Cada épico deve ser fechado com `typecheck` dos dois workspaces e o roteiro de validação executado.

---

## 10. Checklist de encerramento da sprint

- [x] Menu superior fixo em todas as rotas `/app/*`; logo clicável; Voltar em Pendências e detalhe da visita. (`TopNav`, `BackButton`, `PageHeader backTo`)
- [x] Presente/Ausente nas Pendências e na lista de visitas, com desfazer; pendência `presenca_pendente` na API. (`POST /visits/:id/presence`, `PresenceToggle`)
- [x] Drawer acessível no calendário admin com ações. (`components/ui/Drawer.tsx`, `CalendarPage`)
- [x] Banir / Desbanir / Expulsar com confirmação, auditoria e bloqueio imediato; FKs de histórico em SET NULL. (`0019_moderation.sql`, `/users/:id/ban|unban`, `DELETE /users/:id`)
- [x] Promotor: 18+, foto, questionário obrigatório; `promoter_is_eligible` usado no match, na atribuição manual e no calendário do candidato; limite de 1 visita/dia por trigger. (`0020_promoter_guards.sql`, `/promoters/me/onboarding/*`, `PromoterOnboardingPage`)
- [x] Seeds atualizados (promotor demo apto; perguntas de promotor `cccccccc-…01..07`).
- [x] README dos módulos `users`, `auth`, `promoters`, `visits` e `apps/web/src/features/README.md` atualizados com as rotas e telas novas.
- [x] Validação ponta a ponta via script (37 verificações: presença, ban/unban/expulsar, onboarding, elegibilidade, limite diário, janelas públicas). Fluxo visual do candidato a conferir manualmente no navegador.

### Notas de execução

- `run_promoter_match` foi redefinida uma única vez, na `0020` (inclui `not is_banned`, `promoter_is_eligible` e o teto diário), para evitar três cópias do corpo.
- `0019` adiciona o trigger `protect_profile_moderation_columns`: a auto-edição (`profiles_update_self`) não consegue alterar `is_banned`, `is_active`, `role` ou `tenant_id`.
- `parseTstzrange` (API e web) agora normaliza o offset curto do Postgres (`+00` → `+00:00`); sem isso `presenca_pendente` nunca disparava.
- Avatares: bucket público `avatars`, caminho `<uid>/avatar.webp` (canvas 512px, WebP). O promotor demo usa um placeholder externo definido em `scripts/seed-users.mjs`.

---

## 11. Riscos e decisões em aberto

- **Logo → `/` ou `/app`?** O relatório pede "rota inicial (/)". Para usuário logado, `/` é a landing pública; este plano assume `/app` (home do papel) no layout autenticado e `/` no público. Confirmar com o time.
- **Bucket de avatar público vs. privado**: público simplifica (`avatar_url` direto em `<img>`); privado exige signed URLs em todas as listagens. Recomendação: público com nome de arquivo não adivinhável só se houver exigência de LGPD; caso contrário, público com `file_size_limit` e MIME restritos.
- **`max_visits_per_day = 1` global**: o relatório é explícito; manter a coluna para permitir exceções por promotor no futuro (admin pode editar via `PATCH /users/:id` se desejado).
- **Reatribuição automática ao banir/expulsar**: `reassign_visit` (0014) pode não encontrar substituto e gerar `admin_alerts` `no_substitute`; esses alertas ainda não são exibidos na UI (a Sprint 2 cria `GET /alerts`). Até lá, as visitas sem promotor aparecem em Pendências como `sem_promotor`, o que já é suficiente.
- **Alterar FKs em produção** exige janela curta de lock em `visits`; em dev é imediato.
- **Supabase `ban_duration`** bloqueia novos logins e refresh; tokens já emitidos continuam válidos até expirar, por isso o check de `is_banned` no middleware é obrigatório.
- **Perguntas do promotor x candidato**: para o `behavioral_similarity` fazer sentido, as chaves de `traits` devem ser as mesmas nas duas audiências. Revisar o seed do candidato antes de escrever o do promotor.
