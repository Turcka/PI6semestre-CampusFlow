# middlewares/

Middlewares transversais da API Express.

| Arquivo | Responsabilidade |
| --- | --- |
| `error.middleware.ts` | Handler 404 e handler global de erros (`AppError`, `ZodError`, erros inesperados). |
| `auth.middleware.ts` (a criar) | Valida o JWT emitido pelo Supabase Auth (header `Authorization: Bearer`), carrega o `profile` do usuário e anexa `req.user`. |
| `tenant.middleware.ts` (a criar) | Resolve o `tenant_id` a partir do `profile` do usuário e anexa `req.tenantId`; bloqueia acesso cruzado entre instituições. |
| `role.middleware.ts` (a criar) | `requireRole('admin', 'secretaria', ...)` para autorização por papel. |
| `validate.middleware.ts` (a criar) | `validate({ body, query, params })` com schemas zod. |
| `rate-limit.middleware.ts` (a criar) | Limites por IP para rotas públicas (agendamento do candidato, webhooks). |
