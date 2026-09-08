# map (Fase 3)

Mapa interativo do campus (dados servidos para o Leaflet/Mapbox no PWA).

- `GET/POST/PATCH/DELETE /api/v1/map/pois` - pontos de interesse (laboratórios, bibliotecas, praças de alimentação, auditórios) com categoria, coordenadas, fotos (Supabase Storage) e descrição.
- `GET/POST/PATCH/DELETE /api/v1/map/routes` - rotas pré-definidas (sequência de pontos/polilinha), incluindo rotas acessíveis.
- `GET/PUT /api/v1/map/itineraries/:courseId` - roteiro de visita por curso (ex.: Engenharia Química -> laboratórios de química, planta piloto).
- `GET /api/v1/public/map/:campusId` - payload público consolidado (POIs + rotas) para cache offline no service worker.
