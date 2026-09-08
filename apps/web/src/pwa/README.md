# pwa/

Comportamentos específicos de Progressive Web App (RNF-01).

- `register-sw.ts` (a criar) - usa `virtual:pwa-register/react` (`useRegisterSW`) para exibir toast "Nova versão disponível" e acionar `updateServiceWorker()`.
- `offline-map.ts` (a criar) - pré-carrega tiles do campus (bounding box, zooms 15-18) e o payload de POIs ao abrir o mapa pela primeira vez, para navegação sem rede dentro do campus.
- `install-banner.tsx` (a criar) - banner de instalação usando `useInstallPrompt`.

A configuração do manifest e das estratégias de cache (Workbox) está em `vite.config.ts`.
