# checkin (Fase 3)

Check-in de visitantes via QR Code na portaria.

- Ao confirmar a visita, gera `checkin_token` (UUID assinado) e o QR Code (`qrcode`) é enviado ao candidato por WhatsApp/e-mail e exibido no PWA.
- `POST /api/v1/checkin/scan` - portaria/embaixador escaneia o QR; valida token, janela de horário e marca a visita como `checked_in` com timestamp.
- `GET /api/v1/public/checkin/:token/qr.png` - imagem do QR Code do visitante.
- Visitas confirmadas sem check-in após o horário são marcadas como `no_show` por job agendado (`pg_cron`).
