# leads (Fase 1 - RF-01)

Cadastro, higienização e exportação de leads (vestibulandos).

## Endpoints

- `POST /api/v1/leads/import` - upload CSV/XLSX (multer). Retorna preview com linhas válidas, duplicadas e inválidas.
- `POST /api/v1/leads/import/:importId/confirm` - persiste as linhas aprovadas.
- `GET /api/v1/leads` - listagem paginada com filtros (curso, origem, status, período).
- `GET/POST/PATCH/DELETE /api/v1/leads/:id`
- `GET /api/v1/leads/export.xlsx` - exportação Excel (`exceljs`) respeitando os filtros da listagem.
- `POST /api/v1/public/leads` - rota pública usada pelo formulário do candidato antes do agendamento (rate limit).

## Higienização (`leads.hygiene.ts`)

1. Trim e normalização de caixa em nome/e-mail.
2. Telefone para E.164 (`+55DDDNÚMERO`), necessário para a WhatsApp Cloud API.
3. Validação de e-mail e telefone.
4. Deduplicação por e-mail ou telefone dentro do tenant (marca `duplicate_of`).
5. Registro do consentimento LGPD (`consent_at`, `consent_source`).
