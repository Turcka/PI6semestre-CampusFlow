# Plano de Ação - Frontend (React + Tailwind CSS, PWA)

Tecnologia: **React 18 + TypeScript + Tailwind CSS**, empacotado com **Vite** e transformado em **PWA** com `vite-plugin-pwa` (Workbox), conforme RNF-01 ("frontend/mobile (PWA) em React, interfaces nativas e responsivas na Web para secretarias e no Mobile para visitantes"). Mapa com **Leaflet** (`react-leaflet`) e tiles **Mapbox**. Gráficos com Recharts. Estado de servidor com TanStack Query; formulários com React Hook Form + zod; auth com `@supabase/supabase-js`.

Diretório: [`apps/web/`](../apps/web/). Organização por `features/` (domínio) + `components/` (UI genérica) + `app/` (roteamento/providers).

---

## Etapa 0 - Bootstrap e fundações

1. `npm install` na raiz. Já criados: `package.json`, `vite.config.ts` (PWA + proxy `/api` + Vitest), `tailwind.config.ts`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/app/{providers,router}.tsx`, `src/lib/{api,supabase}.ts`, `src/styles/globals.css`.
2. Criar `eslint.config.js` (react-hooks, react-refresh, typescript-eslint), gerar ícones em `public/icons/` (192, 512, maskable).
3. Design system mínimo em `components/ui`: `Button` (variantes primary/secondary/ghost/danger, tamanhos, loading), `Input`, `Select`, `Textarea`, `Checkbox`, `Badge` (status de visita/lead com cores), `Card`, `Dialog`, `Drawer/BottomSheet`, `Table` (responsiva: cards no mobile), `Tabs`, `Toast`, `Skeleton`, `EmptyState`, `Pagination`.
4. Layouts em `app/layouts`: `PublicLayout` (header simples com logo do tenant), `AppLayout` (sidebar colapsável em `md+`, bottom-nav em mobile, topbar com seletor de campus e menu do usuário), `AuthLayout`.
5. Utilitários: `lib/format.ts` (datas `pt-BR` com `date-fns`, telefone, %), `lib/query-keys.ts`, `lib/download.ts`.
6. Acessibilidade e responsividade como padrão: foco visível, `aria-*` nos componentes, breakpoints `sm/md/lg`, alvo de toque mínimo 44px.

Entregável: `npm run dev:web` exibe layout com navegação vazia; `npm run build` gera `dist/` com `manifest.webmanifest` e `sw.js`.

---

## Etapa 1 - Autenticação e sessão (`features/auth`)

1. `LoginPage`: e-mail + senha via `supabase.auth.signInWithPassword`; link "esqueci minha senha" (`resetPasswordForEmail`); página de definição de senha ao aceitar convite (`/auth/callback`).
2. `AuthProvider`: escuta `onAuthStateChange`, busca `GET /auth/me` (perfil, papel, tenant) e expõe `useSession()`.
3. Guards: `RequireAuth` (redireciona para `/login`), `RequireRole(roles)`.
4. Redirecionamento por papel após login: coordenador -> `/app/agenda`; secretaria/admin -> `/app/dashboard`; embaixador -> `/app/checkin`.
5. Tratamento de expiração: `ApiError 401` limpa sessão e redireciona.

---

## Etapa 2 - Fase 1: Core Engine

### 2.1 Área da secretaria - Leads (`features/leads`, RF-01)

1. `LeadsPage` com `LeadsTable`: colunas nome, contato, curso, origem, status (Badge), criado em; ordenação, busca com debounce, filtros (curso, origem, status, período) sincronizados com a URL (`useSearchParams`).
2. `LeadImportWizard` (Dialog em 3 passos): upload (drag and drop, `.csv/.xlsx`) -> preview com abas "Válidos / Duplicados / Inválidos" e motivo por linha -> confirmar; progresso e resumo final.
3. `LeadDetailDrawer`: dados, edição inline, histórico de visitas e mensagens.
4. Botão "Exportar Excel": `fetch` de `/leads/export.xlsx` com filtros atuais, `blob` -> `download.ts`.
5. Hooks: `useLeads(filters)`, `useLead(id)`, `useImportLeads()`, `useConfirmImport()`, `useUpdateLead()` com invalidação de cache.

### 2.2 Área pública do candidato - Agendamento (`features/scheduling`, RF-02/RF-03)

Rota `/agendar/:campusSlug`, mobile-first, sem login.

1. `LeadForm`: nome, e-mail, telefone com máscara BR (convertido para E.164 no submit), curso (select carregado de `/public/campuses/:slug`), origem opcional (UTM), checkbox LGPD com link para política. Schema `publicLeadSchema` do pacote shared.
2. `SlotCalendar`: calendário mensal (dias com vagas destacados) + lista de horários do dia selecionado (`GET /public/scheduling/slots`); mostra coordenador/curso e vagas restantes; slots lotados desabilitados; `refetchInterval` de 30 s.
3. `ConfirmStep`: resumo (data, hora, campus, endereço com link para o mapa) e botão "Reservar". Em `409 SLOT_UNAVAILABLE`/`COORDINATOR_BUSY`: toast explicativo, refetch e volta ao calendário.
4. `SuccessStep`: status "aguardando confirmação do coordenador", o que acontece a seguir (WhatsApp/e-mail), botões "Adicionar ao calendário" (.ics) e "Ver mapa do campus".
5. Persistir progresso do formulário em `sessionStorage` para não perder dados ao atualizar a página.

### 2.3 Área do coordenador - Agenda (`features/calendar`, RF-04)

1. `AgendaPage`: visão semanal (colunas por dia, blocos por evento `Visita Individual - [Nome]`), com badge de status; navegação por semana; mobile mostra lista por dia.
2. `PendingVisitsList`: cards das visitas `pending_confirmation` com dados do candidato e ações **Confirmar** / **Recusar** (dialog com motivo). Contador no menu lateral.
3. `AvailabilityEditor`: grade semanal (dia x horário) para definir regras (início, fim, duração, capacidade) e lista de bloqueios pontuais com date-range picker.
4. Exportar evento `.ics`.

### 2.4 Área da secretaria - Visitas (`features/visits`)

1. `VisitsPage`: tabela com filtros por status, coordenador, campus, período; ações cancelar (motivo), reagendar (reutiliza `SlotCalendar` em Dialog), reenviar comunicação.
2. `VisitTimeline`: histórico (criada, confirmada, lembretes enviados, check-in).

### 2.5 Dashboard (`features/dashboard`, RF-01)

1. `DashboardPage`: `KpiCards` (leads, agendadas, confirmadas, realizadas, no-show %, conversão %) com variação vs período anterior.
2. Gráficos Recharts em `components/charts`: linha (leads por dia), barras (por origem, por curso), funil (lead -> agendado -> confirmado -> check-in -> matriculado).
3. Filtro global de período e campus (contexto `DashboardFilters`), botão exportar Excel.

Entregável da Fase 1: jornada completa candidato -> reserva -> confirmação do coordenador -> visualização na secretaria, responsiva em mobile e desktop.

---

## Etapa 3 - Fase 2: Mensageria (`features/messaging`, RF-05)

1. `TemplatesPage`: lista por canal; `TemplateEditor` com editor de texto (WhatsApp) ou editor HTML simples com blocos (e-mail), inserção de variáveis por menu (`TEMPLATE_VARIABLES`), preview lado a lado renderizado pela API (`/templates/:id/preview`), campo `providerTemplateName` para WhatsApp com aviso sobre aprovação na Meta.
2. `CommunicationRulesPage`: tabela gatilho x canal com toggle ativo, template selecionado e offset (véspera, 1h antes...).
3. `CampaignComposer`: seleção de segmento (filtros de leads com contagem em tempo real), template, agendamento, anexos/localização (WhatsApp), confirmação com estimativa de consumo do plano.
4. `MessageLogsPage`: tabela com status por mensagem (ícones entregue/lido/aberto/clicado/falha), filtros por canal/template/período e cards de taxa de entrega/abertura/clique.
5. Na `VisitTimeline` e `LeadDetailDrawer`, exibir mensagens enviadas.

---

## Etapa 4 - Fase 3: Mapa interativo e check-in

### 4.1 Mapa público (`features/map`), rota `/mapa/:campusSlug`

1. `CampusMap`: `MapContainer` centrado em `campus.latitude/longitude`, `TileLayer` Mapbox (`https://api.mapbox.com/styles/v1/${VITE_MAPBOX_STYLE}/tiles/{z}/{x}/{y}?access_token=${VITE_MAPBOX_ACCESS_TOKEN}`), `maxBounds` do campus, zoom 15-19.
2. `PoiMarkers`: ícones por categoria (`L.divIcon` com Tailwind), clustering opcional; filtro por categoria em chips no topo; busca por nome.
3. `PoiSheet` (bottom sheet): fotos em carrossel, descrição, andar/bloco, acessibilidade, botão "Ir até aqui".
4. `RouteLayer`: `useGeolocation` (watchPosition) desenha marcador do usuário; ao escolher destino, usa rota pré-calculada da API ou reta simples como fallback; instruções resumidas e distância.
5. `ItineraryBanner`: se o visitante abriu pelo link da visita (`?visit=token`), mostra roteiro do curso de interesse com ordem de POIs.
6. **Offline**: estratégias já configuradas em `vite.config.ts` (tiles `CacheFirst`, payload do mapa `StaleWhileRevalidate`, fotos `CacheFirst`). `pwa/offline-map.ts` pré-carrega tiles do bounding box do campus (zooms 16-18) ao abrir o mapa com Wi-Fi; `useOnlineStatus` exibe banner "modo offline".

### 4.2 Gestão do mapa (`/app/mapa`)

1. `PoiManager`: mapa editável (clique posiciona novo POI, arrastar move), formulário lateral, upload de fotos (URL assinada do Supabase Storage), ordenação.
2. `RouteEditor`: seleção sequencial de POIs, pré-visualização da polilinha (rota calculada pela API via Mapbox Directions), marcação "acessível".
3. `ItineraryEditor`: curso -> rota.

### 4.3 Check-in (`features/checkin`)

1. `VisitorQrCard` (`/visita/:token`): QR Code grande, dados da visita, contagem regressiva, botões mapa e "adicionar à carteira" (fallback: salvar imagem). Cacheado pelo SW para abrir sem rede na portaria.
2. `QrScanner` (`/app/checkin`, embaixador/portaria): câmera via `BarcodeDetector` (fallback `@zxing/browser`), feedback sonoro/visual, resultado com nome, coordenador, roteiro do curso e botão "iniciar tour"; lista de check-ins do dia.

---

## Etapa 5 - Fase 4: Analytics e configurações

1. `DashboardPage` avançado: comparação entre campi, métricas de mensageria, tabela de coordenadores (visitas, taxa de confirmação, no-show), exportações.
2. `features/settings`: `TenantSettings` (logo, cores do tenant aplicadas via CSS variables no Tailwind), `CampusesSettings` (mapa para marcar centro/bounds), `UsersSettings` (convites, papéis, cursos por coordenador), `CoursesSettings`, `BillingSettings` (plano, barras de consumo leads/coordenadores/WhatsApp, histórico mensal).
3. Onboarding do tenant: checklist na home do admin (cadastrar campus, cursos, coordenadores, disponibilidade, templates, POIs).

---

## Etapa 6 - Qualidade, PWA e entrega

| Área | Ações |
| --- | --- |
| Testes | Vitest + Testing Library: componentes de UI, `SlotCalendar` (estados vazio/lotado/erro 409), `LeadForm` (validação e E.164), hooks com `QueryClient` de teste e `msw` para a API. |
| PWA | Lighthouse > 90 em PWA/Performance/Acessibilidade; testar instalação em Android/iOS; `useRegisterSW` com toast de atualização; página offline de fallback. |
| Performance | `React.lazy` por rota, code-splitting de Leaflet/Recharts, imagens `webp` do Storage com `srcset`, `staleTime` adequado no TanStack Query. |
| Acessibilidade | Navegação por teclado no calendário, labels e mensagens de erro associadas, contraste AA. |
| i18n | Textos em `pt-BR` centralizados (preparado para `i18next` se necessário). |
| CI/CD | GitHub Actions: `lint` -> `typecheck` -> `test` -> `build`; deploy em Vercel/Netlify com preview por PR; variáveis `VITE_*` via secrets. |
| Segurança | Nunca expor service role; token Mapbox público restrito por domínio; sanitização de HTML de templates no preview (`DOMPurify`). |

---

## Mapa de rotas

| Rota | Layout | Público | Feature |
| --- | --- | --- | --- |
| `/` | Public | todos | landing / redirect |
| `/login`, `/auth/callback` | Auth | todos | auth |
| `/agendar/:campusSlug` | Public | candidato | scheduling |
| `/mapa/:campusSlug` | Public | visitante | map |
| `/visita/:token` | Public | visitante | checkin (QR) |
| `/app/dashboard` | App | admin, secretaria, marketing | dashboard |
| `/app/leads` | App | admin, secretaria, marketing | leads |
| `/app/agenda` | App | coordenador, admin | calendar |
| `/app/visitas` | App | secretaria, admin | visits |
| `/app/mensagens/*` | App | admin, secretaria, marketing | messaging |
| `/app/mapa` | App | admin, secretaria, embaixador | map (gestão) |
| `/app/checkin` | App | embaixador, secretaria | checkin (scanner) |
| `/app/configuracoes/*` | App | admin | settings |

## Cronograma sugerido

| Semana | Entrega |
| --- | --- |
| 1 | Etapas 0-1: design system, layouts, auth, guards. |
| 2 | Leads (tabela, importação, exportação). |
| 3-4 | Agendamento público, agenda do coordenador, visitas, dashboard básico. |
| 5-6 | Mensageria: templates, régua, campanhas, logs. |
| 7 | Mapa público com offline, gestão de POIs/rotas, QR/scanner. |
| 8 | Analytics avançado, configurações e billing. |
| 9 | Testes, Lighthouse, acessibilidade, CI/CD e documentação. |
