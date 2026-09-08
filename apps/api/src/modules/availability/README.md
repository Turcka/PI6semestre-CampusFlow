# availability (Fase 1 - RF-03)

Agenda dos coordenadores/professores que recebem as visitas.

- `GET/PUT /api/v1/availability/rules` - regras semanais recorrentes (dia da semana, hora início/fim, duração do slot, capacidade).
- `GET/POST/DELETE /api/v1/availability/exceptions` - bloqueios pontuais (feriados, reuniões) e liberações extras.
- Coordenador edita apenas a própria agenda; secretaria/admin editam qualquer uma do tenant.

A partir das regras e exceções, o módulo `scheduling` materializa os `visit_slots` para um intervalo de datas.
