# promoters

Perfil do promotor (`promoter_profiles`), histórico e onboarding obrigatório.

## Rotas

- `GET /api/v1/promoters` (admin) — lista promotores com `eligible` / `eligibilityMissing[]`.
- `GET /api/v1/promoters/:id` (admin, próprio promotor) — perfil completo + aptidão.
- `PUT /api/v1/promoters/me/profile` — bio, traits, foco, `maxVisitsPerDay` (padrão 1), cursos, interesses, POIs.
- `GET /api/v1/promoters/me/visits`, `GET /api/v1/promoters/me/history`.

## Onboarding (Sprint 1 / E5)

Questionário comportamental com perguntas `audience = 'promotor'` (reaproveita `chatbot.service` parametrizado
por audiência; a sessão é privada do promotor logado).

- `GET  /api/v1/promoters/me/onboarding` — estado atual (`vw_promoter_eligibility`).
- `POST /api/v1/promoters/me/onboarding/session` — cria ou retoma a sessão `in_progress`.
- `GET  /api/v1/promoters/me/onboarding/session/:id/next`
- `POST /api/v1/promoters/me/onboarding/session/:id/answers { questionId, value }`
- `GET  /api/v1/promoters/me/onboarding/session/:id/review`
- `POST /api/v1/promoters/me/onboarding/session/:id/complete` — RPC `build_promoter_profile`: grava `traits`,
  `promoter_interests`, `preferred_focus`, `onboarding_completed_at`, `behavioral_test_expires_at` (+6 meses).

## Aptidão (`promoter_is_eligible`)

Ativo, não banido, `birth_date` com 18+, `avatar_url` preenchido, onboarding concluído e teste comportamental
dentro da validade. É usada por `run_promoter_match`, `assign_visit_manually` (`PROMOTER_NOT_ELIGIBLE`) e pelo
calendário público do candidato (`listPublicWindows`). O trigger `enforce_promoter_daily_limit` em `visits`
garante `max_visits_per_day` (`PROMOTER_DAILY_LIMIT`) no fuso do tenant.
