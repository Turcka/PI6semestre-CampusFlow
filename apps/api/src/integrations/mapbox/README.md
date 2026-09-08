# mapbox

Uso server-side das APIs do Mapbox (opcional; o mapa em si é renderizado no PWA com Leaflet + tiles Mapbox).

- `mapbox.client.ts` - `geocode(address)` (Geocoding API) para preencher coordenadas de campus/POIs; `directions(from, to, profile: 'walking')` para pré-calcular rotas guiadas que podem ser cacheadas offline.
- Token de servidor separado do token público usado no frontend (`VITE_MAPBOX_ACCESS_TOKEN`).
