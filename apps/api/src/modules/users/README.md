# users

Perfis (`profiles`) vinculados ao `auth.users` do Supabase e seus papéis dentro do tenant.

Papéis: `admin`, `secretaria`, `coordenador`, `marketing`, `embaixador`.

- `GET /api/v1/users` - lista usuários do tenant (filtro por papel).
- `PATCH /api/v1/users/:id` - altera papel, cursos vinculados (coordenadores), ativo/inativo.
- Contagem de coordenadores ativos alimenta o módulo `billing`.
