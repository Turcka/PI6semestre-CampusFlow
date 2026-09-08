# tenants

Instituições de ensino (tenants) e seus campi. Base do modelo SaaS multi-tenant (RNF-04).

- `GET/PATCH /api/v1/tenants/current` - dados e configurações do tenant do usuário.
- `GET/POST/PATCH /api/v1/tenants/current/campuses` - campi (endereço, coordenadas centrais do mapa).
- Configurações: fuso horário, duração padrão de visita, antecedência mínima, régua de comunicação padrão.
