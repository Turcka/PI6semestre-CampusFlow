# leads (RF-01)

- `LeadsTable` com paginação, busca e filtros (curso, origem, status, período).
- `LeadImportWizard`: upload -> preview (válidos / duplicados / inválidos) -> confirmar.
- `LeadDetailDrawer`: dados, histórico de visitas e mensagens.
- Botão "Exportar Excel" chama `GET /api/v1/leads/export.xlsx` com os filtros ativos e baixa o arquivo.
