# integrations/

Adaptadores para serviços externos. Cada integração expõe uma interface estável para os módulos de domínio, isolando detalhes de SDK/HTTP e facilitando mocks nos testes.

| Pasta | Serviço | Uso |
| --- | --- | --- |
| `whatsapp/` | WhatsApp Cloud API (Meta Graph API) | Envio de mensagens de template aprovadas, mensagens de texto dentro da janela de 24h, mídia/localização; parsing de webhooks de status. |
| `sendgrid/` | SendGrid (`@sendgrid/mail`) | Envio de e-mails com dynamic templates, categorias por tenant para métricas; validação de assinatura do Event Webhook. |
| `mapbox/` | Mapbox APIs | Geocodificação de endereços de campus/POIs e cálculo de rotas (Directions API) quando necessário no servidor. O frontend consome tiles diretamente via Leaflet. |

Contrato sugerido:

```ts
export interface MessageProvider {
  send(input: OutboundMessage): Promise<{ providerMessageId: string }>;
}
```
