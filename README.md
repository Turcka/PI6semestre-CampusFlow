# CampusFlow

Plataforma SaaS B2B para centralizar e otimizar a captação de alunos em instituições de ensino superior. O sistema higieniza dados de leads (vestibulandos), resolve a logística de agendamento de visitas ao campus sem sobreposição de horários (double-booking), automatiza a comunicação multicanal (WhatsApp e e-mail) e oferece um mapa interativo do campus.

Projeto Integrador - 6º semestre - Instituto Mauá de Tecnologia.

## Equipe

| Nome | RA |
| --- | --- |
| Arthur Trindade de Souza | 24.002046 |
| Pedro Henrique de Paiva Bittencourt | 24.001627 |
| Miguel Gonçalves Neto | 24.009270 |
| Matheus Garcia Mattoso | 24.003042 |
| Guilherme Viana | 24.006890 |

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend / PWA | React + TypeScript + Tailwind CSS (Vite, vite-plugin-pwa) |
| Backend / API | Node.js + Express + TypeScript |
| Banco de dados | Supabase (PostgreSQL, Auth, Storage, Queues, Cron) |
| Mensageria | WhatsApp Cloud API, SendGrid |
| Mapa | Mapbox (tiles) + Leaflet (react-leaflet) |

## Estrutura do repositório

```
PI6semestre-CampusFlow/
├── apps/
│   ├── api/          # API REST Node.js + Express (agendamento, leads, mensageria, mapa, analytics)
│   └── web/          # PWA React + Tailwind (secretaria, coordenação e candidatos)
├── packages/
│   └── shared/       # Tipos, enums e schemas zod compartilhados entre api e web
├── supabase/         # Migrações SQL, seeds e configuração do Supabase local
└── docs/             # Planos de ação e arquitetura
    ├── arquitetura.md
    ├── plano-banco-de-dados.md
    ├── plano-backend.md
    └── plano-frontend.md
```

## Requisitos mapeados

| ID | Requisito | Onde é atendido |
| --- | --- | --- |
| RF-01 | Dashboards, gráficos e exportação Excel | `apps/api/src/modules/analytics`, `apps/api/src/modules/leads` (export), `apps/web/src/features/dashboard` |
| RF-02 | Calendário de agendamento pelo candidato | `apps/web/src/features/scheduling` |
| RF-03 | Motor de agendamento anti double-booking | `apps/api/src/modules/scheduling` + constraint `EXCLUDE` no banco |
| RF-04 | Evento padronizado `Visita Individual - [Nome]` com confirmação | `apps/api/src/modules/calendar` |
| RF-05 | Notificações automáticas e lembretes | `apps/api/src/modules/messaging` + `apps/api/src/jobs` |
| RNF-01 | PWA responsivo em React | `apps/web` |
| RNF-02 | API em Node.js | `apps/api` |
| RNF-03 | Supabase relacional (ACID) | `supabase/` |
| RNF-04 | SaaS multi-tenant com métricas de cobrança | `tenant_id` + RLS, `apps/api/src/modules/billing` |

## Como rodar (desenvolvimento)

Pré-requisitos: Node.js 20+, npm 10+. O banco pode ser o Supabase remoto (já configurado em `apps/api/.env`) ou local com Docker + [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
# 1. Instalar dependências
npm install

# 2. (Opcional) Supabase local — só se não estiver usando o projeto remoto
npm run db:local:start
npm run db:reset

# 3. Garantir .env (se ainda não existirem)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Subir API + frontend juntos
npm run dev
```

| URL | Serviço |
| --- | --- |
| http://localhost:3333 | API |
| http://localhost:5173 | Frontend |

Scripts úteis:

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API + frontend (o dia a dia) |
| `npm run dev:api` | Só a API |
| `npm run dev:web` | Só o frontend |
| `npm run seed:users` | Cria admin / promotor / professor de demo |
| `npm run dev:full` | API + frontend + worker de filas |

Contas de demo (após `npm run seed:users`): `admin@campusflow.local`, `promotor@campusflow.local`, `professor@campusflow.local` — senha `CampusFlow123!`.

## Roadmap

1. **Fase 1 - Core Engine**: higienização de leads e motor de agendamento sem conflitos.
2. **Fase 2 - Mensageria**: WhatsApp Cloud API, SendGrid e editor de templates.
3. **Fase 3 - Mapa Interativo**: POIs, rotas guiadas e check-in via QR Code.
4. **Fase 4 - Analytics e ERP**: dashboards executivos e conectores para ERPs acadêmicos.

Os planos detalhados de cada camada estão em [`docs/`](docs/).
