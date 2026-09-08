# sendgrid

Cliente de e-mail via `@sendgrid/mail`.

- `sendgrid.client.ts` - `sendEmail({ to, subject, html, text, categories, customArgs })`; `customArgs` carrega `tenant_id`, `message_log_id` para correlacionar eventos.
- `sendgrid.webhook.ts` - valida assinatura (`X-Twilio-Email-Event-Webhook-Signature`) e mapeia eventos `processed`, `delivered`, `open`, `click`, `bounce`, `dropped` para `message_logs`.
- Templates HTML são renderizados no servidor (editor do CampusFlow) e enviados como conteúdo; dynamic templates do SendGrid são opcionais.
