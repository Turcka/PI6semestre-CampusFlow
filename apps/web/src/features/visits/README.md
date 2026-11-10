# visits

- `AdminVisitsPage` — tabela de visitas com status, coluna **Presença** (`PresenceToggle`), pendências e match.
- `VisitDetailPage` — detalhe com botão **Voltar** (`PageHeader backTo="/app/visitas"`) e `PresenceToggle` no cabeçalho.
- `MyVisitsPage` / `VisitBriefingPage` — visão do promotor/professor.
- `PresenceToggle` — Presente / Ausente / Desfazer via `POST /visits/:id/presence`; invalida `visits`,
  `visit`, `calendar` e `analytics`. Usado em Pendências, lista de visitas, detalhe e no Drawer do calendário.
