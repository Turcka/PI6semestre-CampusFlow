# users

Perfis (`profiles`) vinculados ao `auth.users` do Supabase e seus papéis dentro do tenant.

Papéis: `admin`, `promotor`, `professor`.

## Rotas (admin)

- `GET /api/v1/users` — lista usuários do tenant.
  - Filtros: `role`, `isActive`, `q` (nome/e-mail), `assignable=true` (só ativos e não banidos),
    `includeBanned=true`.
  - Cada linha traz `is_banned`, `banned_at`, `ban_reason`, `avatar_url`, `birth_date` e, para promotores,
    `eligible` + `eligibilityMissing[]` (vindos da view `vw_promoter_eligibility`).
- `PATCH /api/v1/users/:id` — altera papel, cursos vinculados, ativo/inativo, nome, telefone,
  data de nascimento (`birthDate`) e foto (`avatarUrl`).

## Moderação (Sprint 1 / E4)

- `POST /api/v1/users/:id/ban { reason }` — RPC `ban_profile`: marca `is_banned`, desativa, cancela convites
  pendentes, solta visitas futuras (voltam para Pendências como `sem_promotor` / `aguardando_professor`) e
  registra `audit_logs` (`profile.ban`). Em seguida bloqueia o login no Supabase Auth (`ban_duration`).
- `POST /api/v1/users/:id/unban` — RPC `unban_profile` + libera login.
- `DELETE /api/v1/users/:id` — RPC `prepare_profile_removal` (libera visitas futuras, fecha slots, audita) e
  `auth.admin.deleteUser`. FKs de histórico (`visits.promoter_id`, `calendar_events.promoter_id`,
  `visit_notes.author_id`, `match_results.promoter_id`, `visit_invitations.profile_id`) estão em `SET NULL`,
  então visitas passadas sobrevivem sem o vínculo.
- Regras: ninguém se bane/remove (`CANNOT_MODERATE_SELF`), último admin ativo é protegido (`LAST_ADMIN`).
- `authMiddleware` devolve `403 USER_BANNED` para perfis banidos mesmo com token ainda válido.
