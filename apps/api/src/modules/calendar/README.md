# calendar (Fase 1 - RF-04)

Eventos de agenda e fluxo de confirmação do professor responsável.

- Ao criar uma visita, gera `calendar_events` com título padronizado:
  `Visita Individual - [Nome do Candidato]` (ou `Visita em Grupo - [Nome da Escola/Caravana]`).
- `GET /api/v1/calendar/events?from=&to=` - agenda do coordenador logado (ou de todos, para secretaria).
- `POST /api/v1/calendar/events/:id/confirm` - professor confirma; visita passa para `confirmed` e dispara evento de domínio `visit.confirmed` (consumido por `messaging`).
- `POST /api/v1/calendar/events/:id/decline` - recusa com motivo; visita `cancelled` e candidato é notificado para reagendar.
- `GET /api/v1/calendar/events/:id/ics` - exporta `.ics` para importar no Google/Outlook.
