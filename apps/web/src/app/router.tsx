import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { HomePage } from './pages/HomePage';

/**
 * Estrutura de rotas prevista:
 *
 *  /                          -> landing / redirecionamento por papel
 *  /login                     -> autenticação (Supabase Auth)
 *  /agendar/:campusSlug       -> área pública do candidato (RF-02)
 *  /mapa/:campusSlug          -> mapa interativo público (Fase 3)
 *  /app                       -> área autenticada (layout com sidebar/bottom-nav)
 *     /app/dashboard          -> dashboards (RF-01)
 *     /app/leads              -> gestão de leads
 *     /app/agenda             -> agenda e confirmações do coordenador (RF-04)
 *     /app/visitas            -> visitas (secretaria)
 *     /app/mensagens          -> templates e régua (Fase 2)
 *     /app/mapa               -> gestão de POIs/rotas (Fase 3)
 *     /app/checkin            -> leitor QR (Fase 3)
 *     /app/configuracoes      -> tenant, usuários, cursos, billing
 */
const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
