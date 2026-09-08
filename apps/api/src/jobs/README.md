# jobs/

Processos assíncronos executados fora do ciclo request/response.

| Arquivo | Descrição |
| --- | --- |
| `worker.ts` | Processo separado (`npm run dev:worker`). Faz polling da fila `pgmq` `messages_outbound` via RPC (`pgmq.read`), envia por WhatsApp/SendGrid, grava `message_logs`, arquiva (`pgmq.archive`) ou reenfileira com backoff até `QUEUE_MAX_RETRIES`. |
| `reminders.job.ts` | Lógica de agendamento de lembretes: ao confirmar a visita, calcula `run_at` (véspera às 18h, 1h antes) e insere em `message_jobs`. A promoção de `message_jobs` para a fila é feita no banco por `pg_cron`. |
| `no-show.job.ts` | Marca visitas confirmadas sem check-in como `no_show` após a janela de tolerância. |
| `usage-metrics.job.ts` | Consolidação mensal de uso para `billing`. |

O worker é *stateless* e pode ser escalado horizontalmente; `pgmq` garante que cada mensagem seja entregue a um único consumidor dentro do `visibility timeout`.
