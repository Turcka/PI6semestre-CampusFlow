# auth

Autenticação via Supabase Auth.

- `GET /api/v1/auth/me` — perfil (inclui `birth_date`, `avatar_url`, `is_banned`), tenant, campi, cursos e,
  para promotores, `onboarding { completed, missing[], completedAt, testExpiresAt, sessionId }`.
- `PATCH /api/v1/auth/me { fullName?, phone?, birthDate?, avatarUrl? }` — auto-edição. `avatarUrl` precisa
  apontar para `avatars/<uid>/…` no Storage. Promotor menor de 18 → `422 PROMOTER_UNDERAGE` (trigger
  `check_promoter_adult`).
- `POST /api/v1/auth/invite` — convida usuário para o tenant (admin). Aceita `phone` e `birthDate`.
- `POST /api/v1/auth/users` — cria usuário com senha (admin). `birthDate` é obrigatória e 18+ para `promotor`.
- Login/refresh acontecem direto no frontend com `@supabase/supabase-js`; a API apenas valida o JWT.
- `authMiddleware` bloqueia perfis inativos (`403`) e banidos (`403 USER_BANNED`).
