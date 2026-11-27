# tenants

Instituições de ensino (tenants) e seus campi. Base do modelo SaaS multi-tenant (RNF-04).

- `GET/PATCH /api/v1/tenants/current` - dados e configurações do tenant do usuário.
- `GET/PATCH /api/v1/tenants/current/settings` (admin) - configuração do assistente virtual (`settings.assistant`: ligado, persona, tom, fatos institucionais, máximo de turnos). O `PATCH` recebe `{ assistant }` e preserva as demais chaves de `settings`; a resposta traz `llmAvailable` (LLM ligada no ambiente da API).
- `GET/POST/PATCH /api/v1/tenants/current/campuses` - campi (endereço, coordenadas centrais do mapa).
- Configurações: fuso horário, duração padrão de visita, antecedência mínima, régua de comunicação padrão.
