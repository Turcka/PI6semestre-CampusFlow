# scheduling (Fase 1 - RF-02, RF-03)

Motor de agendamento anti double-booking.

## Endpoints

- `GET /api/v1/public/scheduling/slots?campusId=&courseId=&from=&to=` - horários disponíveis para o candidato (rota pública, rate limit).
- `POST /api/v1/public/scheduling/visits` - candidato reserva um slot (cria visita `pending_confirmation`).
- `GET /api/v1/scheduling/visits` - listagem para secretaria/coordenador (filtros: status, coordenador, período).
- `PATCH /api/v1/scheduling/visits/:id/cancel`
- `POST /api/v1/scheduling/slots/generate` - materializa slots a partir das regras de `availability` para um período.

## Garantias de não sobreposição

1. **Banco**: constraint `EXCLUDE USING gist (coordinator_id WITH =, period WITH &&)` em `visits` (apenas status ativos) impede dois compromissos do mesmo coordenador no mesmo intervalo.
2. **Capacidade**: função SQL `book_visit(slot_id, lead_id, ...)` faz `SELECT ... FOR UPDATE` no slot, verifica `booked_count < capacity` e insere a visita na mesma transação.
3. **API**: erro `409 SLOT_UNAVAILABLE` traduzido do erro de constraint; o frontend recarrega os horários.

Após a reserva, o módulo `calendar` cria o evento padronizado e o módulo `messaging` recebe o gatilho quando o professor confirmar.
