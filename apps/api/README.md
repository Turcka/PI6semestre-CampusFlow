# @campusflow/api

API REST do CampusFlow em Node.js + Express + TypeScript (RNF-02).

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | API em modo watch (`tsx`). |
| `npm run dev:worker` | Worker de filas de mensageria em modo watch. |
| `npm run build` | Build com `tsup` para `dist/`. |
| `npm run start` / `start:worker` | Executa build de produção. |
| `npm run test` | Testes com Vitest. |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit`. |

## Estrutura

```
src/
├── server.ts          # bootstrap HTTP
├── app.ts             # montagem do Express (testável)
├── config/            # env, logger, supabase
├── middlewares/       # auth, tenant, role, validate, error
├── modules/           # domínios: leads, scheduling, calendar, messaging, map, ...
├── integrations/      # whatsapp, sendgrid, mapbox
├── jobs/              # worker pgmq, lembretes, no-show, métricas
└── utils/
```

## Convenções

- Rotas versionadas em `/api/v1`; rotas públicas (candidato) em `/api/v1/public/*`; webhooks em `/api/v1/webhooks/*`.
- Toda rota autenticada passa por `authMiddleware` -> `tenantMiddleware`; consultas ao banco usam o cliente do usuário (RLS) salvo quando explicitamente necessário o service role.
- Erros de negócio usam `AppError`; validação de entrada com zod (`422`).
- Resposta de erro padronizada: `{ error: { code, message, details? } }`.

Plano detalhado: [`docs/plano-backend.md`](../../docs/plano-backend.md).
