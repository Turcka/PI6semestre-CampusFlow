# modules/

Cada pasta representa um módulo de domínio. Convenção interna de arquivos:

```
<modulo>/
├── <modulo>.routes.ts      # Router Express, aplica middlewares e validação
├── <modulo>.controller.ts  # Traduz HTTP <-> serviço (sem regra de negócio)
├── <modulo>.service.ts     # Regras de negócio e orquestração
├── <modulo>.repository.ts  # Acesso ao Supabase (queries, RPCs)
├── <modulo>.schemas.ts     # Schemas zod de entrada/saída
└── <modulo>.test.ts        # Testes unitários (Vitest)
```

| Módulo | Fase | Requisitos | Descrição |
| --- | --- | --- | --- |
| `health` | - | - | Health check da API. |
| `auth` | 1 | - | Login/refresh via Supabase Auth, convite de usuários, troca de senha. |
| `tenants` | 1 | RNF-04 | CRUD de instituições (tenants) e campi; configurações do tenant. |
| `users` | 1 | - | Perfis (`profiles`) e papéis: admin, secretaria, coordenador, marketing, embaixador. |
| `courses` | 1 | - | Cursos oferecidos por campus; vínculo com coordenadores. |
| `leads` | 1 | RF-01 | Importação CSV/XLSX, higienização (normalização, deduplicação), CRUD, exportação Excel. |
| `availability` | 1 | RF-03 | Regras de disponibilidade semanal dos coordenadores/professores e bloqueios pontuais. |
| `scheduling` | 1 | RF-02, RF-03 | Geração de slots, consulta de horários livres e reserva atômica anti double-booking. |
| `calendar` | 1 | RF-04 | Criação do evento `Visita Individual - [Nome do Candidato]`, confirmação/recusa do professor. |
| `messaging` | 2 | RF-05 | Templates, régua de comunicação, enfileiramento de disparos, webhooks WhatsApp/SendGrid. |
| `map` | 3 | - | POIs, rotas, roteiros por curso; upload de fotos no Supabase Storage. |
| `checkin` | 3 | - | Geração e validação de QR Code de check-in na portaria. |
| `analytics` | 4 | RF-01 | Métricas agregadas para dashboards (funil, no-show, taxa de abertura). |
| `billing` | 4 | RNF-04 | Métricas de uso mensais (leads processados, coordenadores ativos) para cobrança SaaS. |
