# billing (Fase 4 - RNF-04)

Métricas de uso para o modelo SaaS (cobrança por volume de leads ou número de coordenadores).

- Job mensal (`pg_cron`) consolida em `usage_metrics`: leads processados, coordenadores ativos, mensagens WhatsApp enviadas, campi ativos.
- `GET /api/v1/billing/usage?period=YYYY-MM` - consumo do tenant no período.
- `GET /api/v1/billing/plan` - plano contratado, limites e add-ons (pacotes WhatsApp, mapa 3D indoor).
- Limites do plano são verificados nos módulos `leads` (importação) e `users` (novo coordenador).
