# features/

Uma pasta por funcionalidade de negócio. Convenção interna:

```
<feature>/
├── api/          # funções que chamam a API (usam `lib/api.ts`)
├── hooks/        # hooks TanStack Query (useLeads, useCreateVisit, ...)
├── components/   # componentes específicos da feature
├── schemas.ts    # zod schemas de formulários (reaproveitando @campusflow/shared)
└── index.ts      # exports públicos
```

| Feature | Fase | Requisitos | Público | Descrição |
| --- | --- | --- | --- | --- |
| `auth` | 1 | - | Todos | Login, recuperação de senha, aceite de convite (Supabase Auth). |
| `leads` | 1 | RF-01 | Secretaria/Marketing | Tabela com filtros, importação CSV/XLSX com preview de higienização, exportação Excel. |
| `scheduling` | 1 | RF-02, RF-03 | Candidato (público) | Formulário de lead + calendário de horários disponíveis + confirmação da reserva. |
| `calendar` | 1 | RF-04 | Coordenador | Agenda semanal, visitas pendentes com confirmar/recusar, configuração de disponibilidade. |
| `visits` | 1 | RF-03 | Secretaria | Lista/gestão de visitas, cancelamento, reagendamento. |
| `dashboard` | 1/4 | RF-01 | Gestores | Cards de KPIs, gráficos Recharts, funil de conversão. |
| `messaging` | 2 | RF-05 | Secretaria/Marketing | Editor de templates (WhatsApp/e-mail) com preview, régua de comunicação, histórico de disparos. |
| `map` | 3 | - | Visitante (público) | Mapa Leaflet + tiles Mapbox, POIs com fotos, rota até o destino, modo offline. |
| `checkin` | 3 | - | Visitante / Portaria | QR Code do visitante e leitor de QR na recepção. |
| `settings` | 1/4 | RNF-04 | Admin | Tenant, campi, usuários e papéis, cursos, plano e consumo (billing). |
