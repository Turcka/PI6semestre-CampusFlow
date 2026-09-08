# whatsapp

Cliente da WhatsApp Cloud API.

- `whatsapp.client.ts` - `sendTemplate(to, templateName, components)`, `sendText(to, body)`, `sendLocation(to, lat, lng, name)`, `sendMedia(to, url)`.
- `whatsapp.webhook.ts` - verificação (`hub.verify_token`) e parsing de `statuses` (sent/delivered/read/failed) e `messages` (respostas do candidato).
- Endpoint base: `https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`.
- Templates precisam ser aprovados no Meta Business Manager; o nome do template aprovado é salvo em `message_templates.provider_template_name`.
