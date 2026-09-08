# messaging (Fase 2 - RF-05)

Régua de comunicação multicanal (WhatsApp Cloud API e SendGrid).

## Endpoints

- `GET/POST/PATCH/DELETE /api/v1/messaging/templates` - templates por canal com variáveis (`{{candidato.nome}}`, `{{visita.data}}`, `{{coordenador.nome}}`, `{{campus.endereco}}`).
- `GET/PUT /api/v1/messaging/rules` - régua: quais templates disparar em `visit.confirmed`, `reminder.day_before`, `reminder.hour_before`, `visit.completed` (pesquisa de satisfação), `visit.cancelled`.
- `POST /api/v1/messaging/campaigns` - disparo em massa para segmentos de leads (marketing/secretaria/financeiro).
- `GET /api/v1/messaging/logs` - histórico com status (`queued`, `sent`, `delivered`, `read`, `failed`, `opened`, `clicked`).
- `POST /api/v1/webhooks/whatsapp` e `GET` (verificação) - status de entrega/leitura.
- `POST /api/v1/webhooks/sendgrid` - eventos (delivered, open, click, bounce) com validação de assinatura.

## Fluxo

1. `visit.confirmed` -> serviço resolve a régua do tenant, renderiza templates e insere mensagens na fila `pgmq` `messages_outbound` + agenda lembretes em `message_jobs` (`run_at`).
2. `pg_cron` (a cada minuto) move `message_jobs` vencidos para a fila.
3. Worker (`src/jobs/worker.ts`) consome a fila, chama `integrations/whatsapp` ou `integrations/sendgrid`, grava `message_logs` e faz retry com backoff.
