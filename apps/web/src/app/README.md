# app/

Composição da aplicação: roteamento, providers globais e layouts.

- `providers.tsx` - `QueryClientProvider` (TanStack Query); futuros `AuthProvider`, `TenantProvider`, `ThemeProvider`.
- `router.tsx` - rotas (React Router) com lazy loading por feature e guards de autenticação/papel.
- `pages/` - páginas "casca" que compõem componentes das `features/`.
- `layouts/` (a criar) - `PublicLayout` (candidato, mobile-first), `AppLayout` (sidebar no desktop, bottom-nav no mobile), `AuthLayout`.
- `guards/` (a criar) - `RequireAuth`, `RequireRole`.
