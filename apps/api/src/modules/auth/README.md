# auth

Autenticação via Supabase Auth.

- `POST /api/v1/auth/invite` - convida usuário para o tenant (admin/secretaria).
- `GET /api/v1/auth/me` - retorna perfil, papel e tenant do usuário autenticado.
- Login/refresh acontecem direto no frontend com `@supabase/supabase-js`; a API apenas valida o JWT.
