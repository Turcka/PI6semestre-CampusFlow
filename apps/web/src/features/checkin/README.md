# checkin - Fase 3

- `VisitorQrCard` (público, `/visita/:token`): exibe o QR Code da visita, dados do horário e link para o mapa; funciona offline (cacheado).
- `QrScanner` (`/app/checkin`, portaria/embaixador): leitura de QR pela câmera (`BarcodeDetector` com fallback para biblioteca de leitura), chama `POST /api/v1/checkin/scan` e mostra confirmação com nome do visitante e coordenador responsável.
