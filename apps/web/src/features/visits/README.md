# visits - secretaria

- `VisitsTable` com filtros por status (`pending_confirmation`, `confirmed`, `checked_in`, `no_show`, `cancelled`), coordenador e período.
- Ações: cancelar, reagendar (reabre `SlotCalendar` interno), reenviar comunicação.
- `VisitTimeline`: histórico de status e mensagens enviadas (integra com `messaging`).
