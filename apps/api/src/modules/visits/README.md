# visits

Visitas agendadas, status, notas, briefing e pendências operacionais.

## Rotas principais

- `GET /api/v1/visits` — lista paginada. Cada visita traz `pendingIssues[]`:
  `sem_promotor`, `aguardando_professor`, `convite_pendente` e `presenca_pendente`
  (status `confirmada`/`em_atendimento` cujo horário já começou). `?pending=presenca` filtra só estas.
- `GET /api/v1/visits/:id`, `POST /api/v1/visits` (manual), `PATCH /api/v1/visits/:id/status`,
  `POST /api/v1/visits/:id/notes`, `GET /api/v1/visits/:id/briefing`, `POST /api/v1/visits/:id/cancel`,
  `POST /api/v1/visits/:id/reschedule`.
- `POST /api/v1/visits/:id/assign { promoterId, professorId? }` (admin) — RPC `assign_visit_manually`;
  recusa inativos/banidos (`PROFILE_NOT_ASSIGNABLE`) e promotores não aptos (`PROMOTER_NOT_ELIGIBLE`).
- `POST /api/v1/visits/:id/resolve` (admin) — assign + `confirmada` + convites aceitos, em um passo.

## Presença (Sprint 1 / E2)

- `POST /api/v1/visits/:id/presence { present: true | false | null }` (admin)
  - `true` → `realizada`, `false` → `ausente`, `null` → desfaz e volta para `confirmada`.
  - Só para visitas `confirmada`, `em_atendimento`, `realizada` ou `ausente` (`409 PRESENCE_NOT_APPLICABLE`).
  - Internamente usa `set_visit_status`; o admin não tem restrição de transição na RPC.
- Erros de regra do promotor mapeados em `utils/map-rpc-error.ts`: `PROMOTER_DAILY_LIMIT`,
  `PROMOTER_NOT_ELIGIBLE`, `PROFILE_NOT_ASSIGNABLE`.
