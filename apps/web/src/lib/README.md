# lib/

Infraestrutura do frontend.

- `api.ts` - cliente HTTP tipado para a API (anexa JWT do Supabase, normaliza erros em `ApiError`).
- `supabase.ts` - cliente Supabase do browser (Auth + leituras sob RLS).
- `query-keys.ts` (a criar) - fábrica centralizada de chaves do TanStack Query.
- `format.ts` (a criar) - datas (`date-fns`, `pt-BR`), telefone, moeda.
- `download.ts` (a criar) - helper para baixar blobs (exportação Excel).
