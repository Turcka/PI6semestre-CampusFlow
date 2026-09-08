# analytics (Fase 4 - RF-01)

Métricas agregadas para dashboards e gráficos.

- `GET /api/v1/analytics/overview?from=&to=` - leads captados, visitas agendadas/confirmadas/realizadas, no-show, conversão em matrícula.
- `GET /api/v1/analytics/funnel` - funil lead -> agendamento -> confirmação -> check-in -> matrícula.
- `GET /api/v1/analytics/leads-by-source|by-course|by-period`
- `GET /api/v1/analytics/messaging` - taxa de entrega, abertura e cliques por canal/template.
- Consultas baseadas em views/materialized views do Supabase (`vw_funnel`, `mv_leads_daily`), atualizadas por `pg_cron`.
- Fase 4 também prevê conectores ERP (`analytics/erp/`) com interface `ErpConnector` e adapters (TOTVS, Sophia).
