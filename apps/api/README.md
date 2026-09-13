# @campusflow/api

API REST do CampusFlow em Node.js + Express + TypeScript (RNF-02), conectada ao Supabase.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | API em modo watch (`tsx`). |
| `npm run dev:worker` | Worker de filas de mensageria. |
| `npm run build` | Build com `tsup`. |
| `npm run start` / `start:worker` | Produção. |
| `npm run test` | Vitest (hygiene, slot-generator, templates, /health). |
| `npm run typecheck` | `tsc --noEmit`. |

## Pré-requisito obrigatório

Em `apps/api/.env`, preencha a **service role key** do Supabase (Project Settings → API Keys → `service_role` / secret):

```
SUPABASE_URL=https://yothkumsgesitnilpnjc.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # obrigatória para rotas públicas, worker e admin
```

Sem essa chave, `/health` sobe, mas `/health/ready`, rotas públicas e o worker falham.

## Rotas

| Prefixo | Auth | Conteúdo |
| --- | --- | --- |
| `GET /health` | pública | liveness |
| `GET /health/ready` | pública | readiness (Supabase) |
| `GET /docs` | pública | OpenAPI / Swagger UI |
| `/api/v1/public/*` | rate limit | leads, slots, visitas, mapa, QR, campus, surveys |
| `/api/v1/webhooks/*` | assinatura | WhatsApp, SendGrid, ERP |
| `/api/v1/*` | JWT + tenant | auth, tenants, users, courses, leads, availability, scheduling, calendar, messaging, map, checkin, analytics, billing |

### Fluxo principal (RF-02 → RF-05)

1. `POST /api/v1/public/leads` — cria lead com consentimento LGPD  
2. `GET /api/v1/public/scheduling/slots` — horários livres (`available_slots`)  
3. `POST /api/v1/public/scheduling/visits` — `book_visit` (anti double-booking)  
4. `POST /api/v1/calendar/events/:id/confirm` — confirma e agenda mensagens  
5. Worker (`npm run dev:worker`) consome `pgmq` e envia WhatsApp/SendGrid  

## Estrutura

```
src/
├── server.ts / app.ts
├── config/          # env, logger, supabase, openapi
├── middlewares/     # auth, tenant, role, validate, rate-limit, plan-limits
├── modules/         # domínio (routes + controller + service)
├── integrations/    # whatsapp, sendgrid, mapbox, erp
├── jobs/worker.ts   # fila pgmq
├── routes/          # v1, public, webhooks
└── utils/
```

Plano: [`docs/plano-backend.md`](../../docs/plano-backend.md).
