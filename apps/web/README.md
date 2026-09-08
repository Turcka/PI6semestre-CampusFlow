# @campusflow/web

PWA do CampusFlow em React + TypeScript + Tailwind CSS (RNF-01). Atende dois públicos:

- **Web (secretaria, coordenação, marketing, gestores)**: painel administrativo responsivo.
- **Mobile (vestibulandos/visitantes)**: agendamento, QR Code e mapa do campus, instalável e com suporte offline.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Vite dev server em `http://localhost:5173` (proxy `/api` -> API). |
| `npm run build` | Typecheck + build de produção com service worker (Workbox). |
| `npm run preview` | Serve o build (útil para testar PWA/Lighthouse). |
| `npm run test` | Vitest + Testing Library (jsdom). |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit`. |

## Estrutura

```
src/
├── main.tsx  App.tsx
├── app/           # providers, router, layouts, pages
├── components/    # ui, layout, forms, charts
├── features/      # auth, leads, scheduling, calendar, visits, dashboard, messaging, map, checkin, settings
├── hooks/         # hooks genéricos
├── lib/           # api client, supabase client, formatters
├── pwa/           # registro do SW, offline do mapa, banner de instalação
├── styles/        # globals.css (Tailwind + Leaflet)
├── test/          # setup do Vitest
└── types/         # env.d.ts e tipos de UI
```

## Stack

React 18, React Router, TanStack Query, React Hook Form + zod, Tailwind CSS, vite-plugin-pwa, react-leaflet + Mapbox tiles, Recharts, Supabase JS (Auth).

Plano detalhado: [`docs/plano-frontend.md`](../../docs/plano-frontend.md).
