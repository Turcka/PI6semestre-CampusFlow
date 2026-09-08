# config/

Configuração de infraestrutura da API.

- `env.ts` - carrega e valida `process.env` com zod; exporta `env` tipado.
- `logger.ts` - instância `pino` (pretty em desenvolvimento, JSON em produção).
- `supabase.ts` - `getAdminClient()` (service role, sem RLS) e `createUserClient(jwt)` (respeita RLS do usuário).
- `openapi.ts` (a criar) - documento OpenAPI servido em `/docs` via `swagger-ui-express`.
