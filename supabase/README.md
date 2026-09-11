# supabase/

Banco de dados relacional principal do CampusFlow (RNF-03). Projeto hospedado no Supabase (PostgreSQL 17).

## Comandos (sem Supabase CLI)

Como a Supabase CLI não está instalada nas máquinas da equipe, as migrações são aplicadas pelo script `scripts/db.mjs` (Node + `pg`), que lê `SUPABASE_DB_URL` do `.env` da raiz.

```bash
npm run db:status    # lista migrações aplicadas / pendentes
npm run db:migrate   # aplica migrações pendentes (em ordem, uma transação por arquivo)
npm run db:seed      # aplica supabase/seed.sql (idempotente)
npm run db:check     # smoke test: double-booking, RF-04, régua RF-05, check-in (roda com ROLLBACK)
npm run db:reset     # DESTRUTIVO: apaga o schema public e reaplica migrações + seed
```

O histórico de migrações fica na tabela `public._migrations`.

### Conexão

Use o **Session pooler** (IPv4) do painel do Supabase (*Connect > Session pooler*):

```
postgresql://postgres.<project-ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres
```

A conexão direta (`db.<ref>.supabase.co:5432`) só funciona em redes com IPv6.

### Com a Supabase CLI (opcional)

```bash
supabase start            # ambiente local (Docker)
supabase db reset         # aplica migrations/ e seed.sql localmente
supabase gen types typescript --project-id <ref> > packages/shared/src/database.types.ts
```

Atalhos: `npm run db:local:start`, `db:local:stop`, `db:local:reset`.

## Migrações

| Arquivo | Conteúdo |
| --- | --- |
| `0001_extensions.sql` | `pgcrypto`, `btree_gist`, `pg_cron`, `pgmq`, `pg_trgm`; fila `messages_outbound`. |
| `0002_enums.sql` | Tipos ENUM (`user_role`, `visit_status`, `message_channel`, ...) espelhando `@campusflow/shared`. |
| `0003_tenancy.sql` | `tenants`, `campuses`, `profiles`, `courses`, `coordinator_courses`; trigger em `auth.users` que cria o profile; funções `current_tenant_id()`, `current_user_role()`, `has_role()`. |
| `0004_leads.sql` | `leads`, `lead_imports`, `lead_tags`, `lead_tag_assignments`; índices trigram e únicos parciais; bucket `lead-imports`. |
| `0005_scheduling.sql` | `availability_rules`, `availability_exceptions`, `visit_slots` (EXCLUDE por coordenador), `visits` (EXCLUDE em slots exclusivos), `calendar_events`; funções `book_visit()`, `cancel_visit()`, `confirm_calendar_event()`, `decline_calendar_event()`, `generate_visit_slots()`, `available_slots()`. |
| `0006_messaging.sql` | `message_templates`, `communication_rules`, `campaigns`, `message_jobs`, `message_logs`; `render_template()`, `schedule_visit_communications()`, trigger de status da visita; wrappers `queue_*` para pgmq; cron `promote-message-jobs`. |
| `0007_map.sql` | `pois`, `poi_photos`, `routes`, `route_points`, `itineraries`, `checkins`; `check_in_visit()`; view `vw_public_campus_map`; buckets `poi-photos` e `tenant-assets`. |
| `0008_analytics_billing.sql` | `plans`, `tenant_subscriptions`, `usage_metrics`, `audit_logs`; views `vw_funnel`, `vw_visits_summary`, `vw_messaging_metrics`, `mv_leads_daily`; jobs `mark_no_shows()`, `consolidate_usage_metrics()`, `anonymize_lead()`, `apply_lead_retention()`; crons. |
| `0009_rls.sql` | RLS em todas as tabelas, políticas por tenant e papel, políticas de Storage. |

## Fluxo garantido pelo banco

1. **Anti double-booking (RF-03)**: `visit_slots_no_overlap` impede slots sobrepostos por coordenador; `book_visit()` trava o slot (`FOR UPDATE`) e verifica capacidade; `visits_no_overlap` é a segunda barreira para slots exclusivos.
2. **Evento padronizado (RF-04)**: trigger em `visits` cria `calendar_events` com título `Visita Individual - [Nome do Candidato]`.
3. **Régua (RF-05)**: confirmar o evento muda a visita para `confirmed` e agenda `message_jobs` (confirmação, véspera, 1h antes, pós-visita). `pg_cron` promove jobs vencidos para a fila `pgmq`, consumida pelo worker Node.

## Convenções

- Todas as tabelas de negócio têm `tenant_id`, `created_at`, `updated_at`; RLS ativa em todas.
- Enums do banco e de `packages/shared/src/enums.ts` devem andar juntos.
- Nunca editar uma migração já aplicada; criar uma nova (`00NN_nome.sql`).
- O `service_role` ignora RLS: usar somente no worker e nas rotas públicas da API, sempre passando por funções `security definer` (`book_visit`, `check_in_visit`, ...).

Detalhes completos em [`docs/plano-banco-de-dados.md`](../docs/plano-banco-de-dados.md).
