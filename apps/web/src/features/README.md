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
| `visits` | 1 | RF-03 | Admin | Lista/gestão de visitas, cancelamento, reagendamento, registro de presença (`PresenceToggle`). |
| `pendencies` | 1 | - | Admin | Central de pendências: presença a registrar, sem promotor, aguardando professor, convites; resolve escalando só promotores aptos. |
| `onboarding` | 1 | - | Promotor | `PromoterOnboardingPage` (`/app/onboarding`): foto + nascimento → questionário comportamental → revisão → concluído. Guard `RequirePromoterOnboarding` bloqueia o app até ficar apto. |
| `profiles` | 1 | - | Promotor/Professor | `PersonalDataCard` (foto via `AvatarUploader` → bucket `avatars`, telefone, nascimento), checklist de aptidão do promotor. |
| `dashboard` | 1/4 | RF-01 | Gestores | Cards de KPIs, gráficos Recharts, funil de conversão. |
| `messaging` | 2 | RF-05 | Secretaria/Marketing | Editor de templates (WhatsApp/e-mail) com preview, régua de comunicação, histórico de disparos. |
| `map` | 3 | - | Visitante (público) | Mapa Leaflet + tiles Mapbox, POIs com fotos, rota até o destino, modo offline. |
| `checkin` | 3 | - | Visitante / Portaria | QR Code do visitante e leitor de QR na recepção. |
| `settings` | 1/4 | RNF-04 | Admin | Usuários (criar com data de nascimento, **Banir / Desbanir / Expulsar** com confirmação em Drawer, selo Apto/Pendente), perguntas do chatbot, pesos do match. |

Layout autenticado (`app/layouts`): `TopNav` fixo no topo com logo → `/app`, itens por papel, usuário + Sair e
menu hambúrguer (Drawer) no mobile; `PageHeader backTo` exibe o botão Voltar. Componentes compartilhados novos em
`components/ui`: `Drawer` (portal, Esc/overlay, focus trap) e `BackButton`.
