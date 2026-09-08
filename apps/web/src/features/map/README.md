# map - Fase 3

Mapa interativo do campus com `react-leaflet` e tiles Mapbox.

- `CampusMap`: `MapContainer` + `TileLayer` (`https://api.mapbox.com/styles/v1/{style}/tiles/{z}/{x}/{y}?access_token=...`), marcadores de POIs por categoria com ícones customizados.
- `PoiSheet`: bottom sheet com fotos, descrição e botão "Ir até aqui".
- `RouteLayer`: polilinha da posição atual (Geolocation API) até o POI; rotas pré-calculadas vêm da API.
- `ItineraryBanner`: roteiro sugerido conforme o curso de interesse do visitante.
- Offline: tiles e payload `/public/map/:campusId` cacheados pelo service worker (ver `vite.config.ts`).
- Área administrativa (`/app/mapa`): CRUD de POIs (clique no mapa para posicionar), upload de fotos para o Supabase Storage, editor de rotas.
