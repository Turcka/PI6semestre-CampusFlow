# scheduling (RF-02, RF-03) - área pública do candidato

Fluxo mobile-first em `/agendar/:campusSlug`:

1. `LeadForm` - nome, e-mail, telefone (máscara BR), curso de interesse, consentimento LGPD.
2. `SlotCalendar` - calendário mensal + lista de horários do dia (`GET /public/scheduling/slots`); slots lotados aparecem desabilitados.
3. `ConfirmStep` - resumo e botão reservar (`POST /public/scheduling/visits`). Em `409 SLOT_UNAVAILABLE`, exibe aviso e recarrega horários.
4. `SuccessStep` - status "aguardando confirmação do coordenador", instruções e link para o mapa do campus.
