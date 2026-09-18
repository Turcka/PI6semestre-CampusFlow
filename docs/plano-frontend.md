# Plano de Ação - Frontend (React + Tailwind CSS, PWA) - Revisão 2

Tecnologia mantida: **React 18 + TypeScript + Tailwind CSS**, **Vite** + `vite-plugin-pwa`, TanStack Query, React Hook Form + zod, `@supabase/supabase-js` (auth de admin/promotor/professor), Recharts. Leaflet/Mapbox ficam restritos à gestão de POIs (roteiro); o mapa público offline deixa de ser prioridade.

Fonte dos requisitos: **Documento de Requisitos do Sistema - Plataforma Inteligente para Agendamento e Gestão de Visitas Individuais**, seções 3.1–3.14, 4 (módulos), 5 (fluxo) e 6 (status). APIs de referência: [`plano-backend.md`](plano-backend.md) (Revisão 2).

Diretório: [`apps/web/`](../apps/web/). Organização por `features/` (domínio) + `components/` (UI genérica) + `app/` (roteamento/providers).

---

## Etapa R0 - Estado atual e reajuste

Implementado até agora: apenas o **scaffold** - `vite.config.ts` (PWA, proxy `/api`, Vitest), Tailwind, `main.tsx`, `App.tsx`, `app/{providers,router}.tsx` com a rota `/` (`HomePage` placeholder), `lib/{api,supabase}.ts`, e READMEs em `features/*` descrevendo o backlog antigo. Não há telas de negócio, portanto **não há código de UI a desfazer**; o reajuste é de backlog e estrutura de pastas.

### Tabela "legado planejado -> destino"

| Feature planejada (Revisão 1) | Destino |
| --- | --- |
| `features/auth` (login, callback, guards) | **Manter**; papéis `admin`, `promotor`, `professor`. |
| `features/leads` (tabela, `LeadImportWizard`, exportação Excel) | **Substituir** por `features/candidates` (lista/detalhe do candidato, sem importação em massa nem exportação Excel). |
| `features/scheduling` (formulário + `SlotCalendar` público) | **Substituir** por `features/chatbot` (jornada guiada) + `features/scheduling` (escolha de janela após o perfil). |
| `features/calendar` (agenda do coordenador, confirmar/recusar) | **Evoluir** em duas: `features/invitations` (promotor/professor aceitam/recusam) e `features/calendar` (calendário operacional do admin com filtros). |
| `features/visits` (tabela da secretaria) | **Manter e ampliar**: status novos, match/justificativa, reencaminhamentos, notas, briefing. |
| `features/dashboard` (KPIs de leads) | **Reescrever** com os indicadores do §3.10. |
| `features/messaging` (templates, régua, campanhas WhatsApp, logs) | **Reduzir**: templates de e-mail, régua por gatilho/público, logs. Campanhas e WhatsApp saem do backlog. |
| `features/map` (mapa público offline, `PoiManager`, `RouteEditor`) | **Reorientar**: gestão de POIs com tags de interesse e promotores aptos; `RouteEditor` mantido; mapa público e pré-cache offline saem do núcleo. |
| `features/checkin` (QR do visitante, scanner do embaixador) | **Remover** do backlog; comparecimento é ação na visita (`features/visits`). |
| `features/settings` (`BillingSettings`, `TenantSettings`, usuários, cursos) | **Manter** usuários/cursos/tenant; **remover** billing; **adicionar** perguntas do chatbot, pesos do match, regras de professor, políticas de agendamento, categorias de interesse. |
| `pwa/offline-map.ts` | **Remover** do backlog; PWA mantido para instalação e cache de shell (promotor consulta briefing no celular). |
| READMEs em `features/*` | **Reescrever** conforme as novas features; pastas de features removidas ganham nota de descontinuação e são apagadas ao criar as substitutas. |

Entregável: estrutura de `features/` renomeada, `router.tsx` com o novo mapa de rotas (páginas placeholder) e `npm run build` verde.

---

## Etapa R1 - Fundações e autenticação (`components/ui`, `app/layouts`, `features/auth`)

1. Design system mínimo em `components/ui` (mantido do plano anterior): `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup`, `Badge` (mapa de cores por `visit_status`: agendada, aguardando promotor, aguardando professor, confirmada, em atendimento, realizada, ausente, cancelada, reagendada), `Card`, `Dialog`, `Drawer/BottomSheet`, `Table` (cards no mobile), `Tabs`, `Toast`, `Skeleton`, `EmptyState`, `Pagination`, `Stepper` (jornada do chatbot), `ScoreBar` (índice de compatibilidade em %).
2. Layouts: `PublicLayout` (candidato, mobile-first), `AppLayout` (sidebar em `md+`, bottom-nav em mobile, contador de pendências no menu), `AuthLayout`.
3. `features/auth`: `LoginPage` (`signInWithPassword`, esqueci senha, callback de convite), `AuthProvider` com `GET /auth/me`, guards `RequireAuth` / `RequireRole`.
4. Redirecionamento por papel: `admin` -> `/app/pendencias`; `promotor` -> `/app/convocacoes`; `professor` -> `/app/solicitacoes`.
5. Utilitários: `lib/format.ts` (datas `pt-BR`, CPF com máscara, telefone, %), `lib/query-keys.ts`, `lib/candidate-token.ts` (persistência do `portalToken` em `localStorage` para a área do candidato).

---

## Etapa R2 - Jornada pública do candidato (`features/chatbot`, `features/scheduling`, `features/candidate-portal`) - §3.1, §3.2, §3.5

Rota `/visita/:campusSlug` (mobile-first, sem login). Progresso salvo em `sessionStorage` + `sessionId` retornado pela API.

1. **Cadastro** (`RegisterStep`): nome completo, CPF (máscara + validação de dígitos com `cpfSchema` do shared), e-mail, telefone (E.164 no submit), curso de interesse (`GET /public/campuses/:slug`), consentimento LGPD. `POST /public/candidates` -> `sessionId`, `portalToken`.
2. **Chatbot** (`ChatbotConversation`): interface conversacional (balões, avatar institucional, indicador de digitação) que consome `GET /sessions/:id/next` e envia `POST /answers`. Componentes por tipo: `SingleChoiceBubble`, `MultiChoiceBubble`, `ScaleBubble` (1–5), `FreeTextBubble`, `AvailabilityPicker` (dias da semana + faixas de horário, com opção "datas específicas"). Barra de progresso; botão "voltar" reenvia resposta anterior.
3. **Revisão** (`ReviewStep`): lista pergunta -> resposta com "editar"; confirma e chama `POST /complete`; exibe `ProfileSummaryCard` (interesses identificados como chips, foco da visita, resumo textual).
4. **Escolha da janela** (`WindowPicker`): `GET /public/scheduling/windows` - calendário mensal com dias que têm promotor elegível destacados; lista de janelas do dia; `refetchInterval` 30 s. `POST /public/scheduling/visits`. Em `NO_ELIGIBLE_PROMOTER`, sugere outras janelas; em `PARTICIPANT_BUSY`, refetch e volta ao calendário.
5. **Confirmação** (`ScheduledStep`): status "aguardando confirmação do promotor", o que acontece a seguir (e-mail), botão "adicionar ao calendário" (.ics) e link para o portal do candidato.
6. **Portal do candidato** (`/minha-visita`, acesso pelo link do e-mail com `portalToken`): situação da visita (timeline de status), promotor (primeiro nome) e horário, ações **reagendar** (reutiliza `WindowPicker`) e **cancelar** (exibe antecedência mínima e bloqueia quando fora da política), atualizar dados cadastrais, histórico de visitas.

Entregável: jornada cadastro -> chatbot -> perfil -> janela -> agendamento funcionando contra a API, responsiva.

---

## Etapa R3 - Promotor (`features/invitations`, `features/promoter`) - §3.3, §3.6, §3.8

1. `InvitationsPage` (`/app/convocacoes`): cards de convocações pendentes com contagem regressiva do prazo (`expiresAt`), dados do candidato (nome, curso, foco, top interesses, resumo), horário e professor (se houver); ações **Aceitar** / **Recusar** (dialog com motivo). Estado vazio explicativo. Badge com contagem no menu.
2. `MyVisitsPage` (`/app/minhas-visitas`): lista por dia (próximas / passadas), badge de status, atalho para o briefing. Ações de comparecimento na própria linha: **Iniciar atendimento**, **Concluir**, **Marcar ausência** (`PATCH /visits/:id/status`).
3. `VisitBriefingPage` (`/app/minhas-visitas/:id`): "Preparação da visita" - perfil do candidato, dúvidas/interesses, professor recomendado, **roteiro sugerido** (`ItineraryList` ordenável com motivo de cada POI e botão reordenar/remover/adicionar), notas antes/durante/depois (`VisitNotes`), horário e local. Layout pensado para celular (promotor usa durante o tour); PWA cacheia o shell.
4. `PromoterProfilePage` (`/app/meu-perfil`): questionário comportamental (reutiliza `ChatbotConversation` com `audience = promotor`), cursos com familiaridade (1–5), interesses (nível), foco preferido, laboratórios/espaços aptos (multi-select de POIs), máximo de visitas por dia, "aceitar match automático".
5. `AvailabilityEditor` (`/app/disponibilidade`): grade semanal de regras + bloqueios pontuais; botão destacado **"Indisponibilidade de última hora"** (data/hora + motivo) que mostra o resultado do reencaminhamento (`reassigned` / `noSubstitute`).
6. `PromoterHistoryPage`: visitas realizadas, comparecimento, remanejamentos, avaliação média.

---

## Etapa R4 - Professor (`features/professor`) - §3.7

1. `RequestsPage` (`/app/solicitacoes`): solicitações de participação pendentes com dados da visita (candidato, curso, foco, promotor, horário) e ações **Aceitar** / **Recusar** com motivo.
2. `ProfessorVisitsPage` (`/app/minhas-visitas`, mesma feature de visitas com filtro por professor).
3. `ProfessorProfilePage`: área de atuação, cursos que atende, temas/dúvidas em que pode atender, "aceita visitas", "professor substituto".
4. `AvailabilityEditor` reutilizado (`ownerId` = professor).

---

## Etapa R5 - Administração operacional (`features/pendencies`, `features/calendar`, `features/visits`, `features/candidates`) - §3.9, §3.12, §3.14

1. `PendingIssuesPage` (`/app/pendencias`, home do admin): central de pendências agrupada por tipo (sem promotor, aguardando professor, convite expirando, professor obrigatório ausente, conflitos, alertas críticos) com ação direta em cada item (match manual, substituir, cancelar, resolver alerta).
2. `CalendarPage` (`/app/calendario`): vistas **dia / semana / mês**; cada evento mostra horário, candidato, curso, promotor, professor e status (cor do `Badge`); indicadores de conflito e pendência de aprovação; filtros por curso, promotor, professor, status e período; busca por nome ou CPF; botão **Exportar agenda** (CSV). Painel lateral "Agenda de promotores e professores" (`GET /calendar/agenda/:profileId`).
3. `VisitsPage` (`/app/visitas`): tabela com filtros (status, curso, promotor, professor, campus, período, busca nome/CPF) e coluna de compatibilidade (`ScoreBar`). Ações: alterar status, cancelar/reagendar (com `override` auditado), substituir promotor/professor, **adicionar visita manual** (`NewVisitDialog`: candidato, janela, promotor/professor opcionais).
4. `VisitDetailPage` (`/app/visitas/:id`): abas **Resumo** (candidato, horário, participantes, status), **Match** (ranking com score, breakdown e justificativa; fila reserva; botão "match manual"), **Histórico** (status com data/usuário, reencaminhamentos com motivo, notas), **Roteiro**, **Comunicações** (e-mails enviados e agendados).
5. `CandidatesPage` (`/app/candidatos`) + `CandidateDetailDrawer`: dados cadastrais (edição), perfil comportamental, interesses, resumo do chatbot, respostas, histórico de visitas, conversão (Rubeus).
6. `UsersSettings` ampliado: lista de promotores e professores com atalhos para editar perfil, disponibilidade e bloqueios em nome do usuário (auditado).

---

## Etapa R6 - Dashboard e conversão (`features/dashboard`) - §3.10, §3.11

1. `DashboardPage` (`/app/dashboard`): filtros globais (período, curso, promotor, status, campus). `KpiCards`: agendadas, confirmadas, realizadas, ausentes, canceladas, reagendadas; taxa de comparecimento, de cancelamento e de reagendamento; taxa de ocupação dos horários; quantidade de remanejamentos; taxa de conversão visitante -> aluno.
2. Gráficos (Recharts em `components/charts`): série diária (agendadas x realizadas x ausentes), barras por curso e por promotor, ocupação por semana, remanejamentos por motivo, conversão por curso/período e por faixa de compatibilidade.
3. `PromotersTable`: visitas realizadas, comparecimento, remanejamentos sofridos, avaliação.
4. `ConversionPanel`: status de conversão por candidato (Rubeus), botão "marcar matrícula manualmente" (auditado), indicador de sincronização (última atualização/erros).

---

## Etapa R7 - Configurações do processo (`features/settings`) - §3.14

Rotas em `/app/configuracoes/*` (somente `admin`):

| Página | Conteúdo |
| --- | --- |
| `ChatbotQuestionsSettings` | Lista ordenável (drag and drop) de perguntas por público (candidato/promotor) e por curso; editor de pergunta (tipo, opções, mapeamento opção -> interesses/traits/foco, obrigatória); pré-visualização em `ChatbotConversation`. |
| `InterestCategoriesSettings` | CRUD de categorias de interesse (tecnologia, carros, ...). |
| `MatchWeightsSettings` | Tabela de critérios com peso (slider), tipo (obrigatório/complementar/desempate) e mínimo; **simulador**: escolhe candidato + janela e vê o ranking com justificativa (`POST /match/preview`). |
| `ProfessorRulesSettings` | Regras "quando o professor é obrigatório/recomendado" por curso, foco e interesse. |
| `SchedulingPoliciesSettings` | Antecedência mínima para cancelar/reagendar por foco, prazo do convite, máximo de remanejamentos, duração padrão. |
| `NotificationsSettings` | Templates de e-mail (editor com variáveis, preview pela API) e régua gatilho x público com toggle. |
| `CampusSettings` | Campus, cursos, POIs (mapa Leaflet para posicionar) com tags de interesse, rotas e roteiro base por curso. |
| `UsersSettings` | Convites (`admin`, `promotor`, `professor`), ativação, perfis. |
| `AuditLogPage` | Histórico de ações administrativas e decisões automáticas (quem, quando, o que mudou). |

---

## Etapa R8 - Qualidade, PWA e entrega

| Área | Ações |
| --- | --- |
| Testes | Vitest + Testing Library: `ChatbotConversation` (tipos de pergunta, voltar, revisão), `WindowPicker` (vazio, sem elegível, 409), `RegisterStep` (CPF/E.164), `InvitationsPage` (aceitar/recusar, expiração), hooks com `QueryClient` de teste e `msw`. |
| PWA | Instalação em Android/iOS; cache do shell e das rotas do promotor (`/app/convocacoes`, `/app/minhas-visitas/*`); `useRegisterSW` com toast de atualização. Sem pré-cache de tiles. |
| Performance | `React.lazy` por rota; Recharts e Leaflet em chunks separados; `staleTime` por recurso (pendências 15 s, dashboard 60 s). |
| Acessibilidade | Chatbot navegável por teclado e leitor de tela (`aria-live` nas mensagens), contraste AA, alvo de toque 44 px. |
| Segurança | `portalToken` só em `localStorage` da área pública e enviado em header; sanitização de HTML nos previews de e-mail (`DOMPurify`); nenhuma chave privada no cliente. |
| CI/CD | GitHub Actions `lint` -> `typecheck` -> `test` -> `build`; deploy em Vercel/Netlify com preview por PR. |

---

## Mapa de rotas

| Rota | Layout | Público | Feature |
| --- | --- | --- | --- |
| `/` | Public | todos | landing / redirect |
| `/login`, `/auth/callback` | Auth | todos | auth |
| `/visita/:campusSlug` | Public | candidato | chatbot + scheduling |
| `/minha-visita` | Public (token) | candidato | candidate-portal |
| `/app/pendencias` | App | admin | pendencies |
| `/app/dashboard` | App | admin | dashboard |
| `/app/calendario` | App | admin | calendar |
| `/app/visitas`, `/app/visitas/:id` | App | admin | visits |
| `/app/candidatos` | App | admin | candidates |
| `/app/convocacoes` | App | promotor | invitations |
| `/app/solicitacoes` | App | professor | professor |
| `/app/minhas-visitas`, `/app/minhas-visitas/:id` | App | promotor, professor | visits (visão do participante) + briefing |
| `/app/meu-perfil` | App | promotor, professor | promoter / professor |
| `/app/disponibilidade` | App | promotor, professor | availability |
| `/app/configuracoes/*` | App | admin | settings |

## Cronograma revisado

| Semana | Entrega |
| --- | --- |
| 1 | R0–R1: reestruturação de `features/`, design system, layouts, auth e redirecionamento por papel. |
| 2–3 | R2: jornada pública (cadastro, chatbot, revisão, janela, confirmação) e portal do candidato. |
| 4 | R3: convocações, minhas visitas, briefing/roteiro, perfil e disponibilidade do promotor. |
| 5 | R4–R5 (parte 1): professor; central de pendências; calendário operacional. |
| 6 | R5 (parte 2): visitas (detalhe com match, histórico, roteiro, comunicações), candidatos. |
| 7 | R6: dashboard e conversão. |
| 8 | R7: configurações (chatbot, pesos, regras, políticas, notificações, campus/POIs, auditoria). |
| 9 | R8: testes, PWA, acessibilidade, CI/CD, documentação. |
