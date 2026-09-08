# @campusflow/shared

Código compartilhado entre `apps/api` e `apps/web`, consumido diretamente como TypeScript (sem build) via npm workspaces.

| Arquivo | Conteúdo |
| --- | --- |
| `src/enums.ts` | Papéis de usuário, status de lead/visita/mensagem, canais, gatilhos da régua, categorias de POI. Espelham os `ENUM` do banco. |
| `src/constants.ts` | Título padronizado do evento (RF-04), variáveis de template, nomes de filas, defaults. |
| `src/schemas.ts` | Schemas zod usados tanto na validação da API quanto nos formulários do frontend. |
| `src/types.ts` | DTOs das entidades expostas pela API. |

Regra: alterou um enum aqui, crie a migração correspondente em `supabase/migrations`.
