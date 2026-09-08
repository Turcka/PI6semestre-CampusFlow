# supabase/

Banco de dados relacional principal do CampusFlow (RNF-03), gerenciado com a Supabase CLI.

## Comandos

```bash
supabase start            # sobe Postgres, Auth, Storage, Studio (http://127.0.0.1:54323)
supabase db reset         # recria o banco aplicando migrations/ e seed.sql
supabase migration new <nome>   # cria supabase/migrations/<timestamp>_<nome>.sql
supabase db diff -f <nome>      # gera migração a partir de alterações feitas no Studio
supabase gen types typescript --local > packages/shared/src/database.types.ts
supabase db push          # aplica migrações no projeto remoto (produção)
```

Na raiz do monorepo há atalhos: `npm run db:start`, `db:stop`, `db:reset`, `db:migration`.

## Ordem prevista das migrações

| Arquivo | Conteúdo |
| --- | --- |
| `0001_extensions.sql` | pgcrypto, btree_gist, pg_cron, pgmq, pg_trgm; fila `messages_outbound`. |
| `0002_enums.sql` | Tipos ENUM (`user_role`, `visit_status`, `message_channel`, ...) espelhando `@campusflow/shared`. |
| `0003_tenancy.sql` | `tenants`, `campuses`, `profiles`, `courses`, `coordinator_courses`; função `current_tenant_id()`. |
| `0004_leads.sql` | `leads`, `lead_imports`, `lead_tags`, índices trigram. |
| `0005_scheduling.sql` | `availability_rules`, `availability_exceptions`, `visit_slots`, `visits` (EXCLUDE), `calendar_events`, função `book_visit()`. |
| `0006_messaging.sql` | `message_templates`, `communication_rules`, `message_jobs`, `message_logs`; cron de promoção de lembretes. |
| `0007_map.sql` | `pois`, `poi_photos`, `routes`, `route_points`, `itineraries`, `checkins`. |
| `0008_analytics_billing.sql` | `plans`, `tenant_subscriptions`, `usage_metrics`, `audit_logs`, views/materialized views, crons de no-show e métricas. |
| `0009_rls.sql` | Habilita RLS e cria políticas por tenant/papel em todas as tabelas. |

Detalhes completos em [`docs/plano-banco-de-dados.md`](../docs/plano-banco-de-dados.md).

## Convenções

- Todas as tabelas de negócio possuem `tenant_id uuid not null references tenants(id)`, `created_at`, `updated_at`.
- Nomes em `snake_case`, tabelas no plural, chaves primárias `id uuid default gen_random_uuid()`.
- RLS habilitado em todas as tabelas; o service role (usado pelo worker) ignora RLS por design.
- Nunca editar uma migração já aplicada em produção; criar uma nova.
