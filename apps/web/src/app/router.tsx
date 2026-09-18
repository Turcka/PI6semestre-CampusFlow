import { Navigate, useParams, createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AppLayout } from '@/app/layouts/AppLayout';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { HomePage } from '@/app/pages/HomePage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth, RequireRole, homeForRole, useAuth } from '@/features/auth/AuthProvider';
import { AvailabilityPage } from '@/features/availability/AvailabilityPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { CandidatePortalPage } from '@/features/candidate-portal/CandidatePortalPage';
import { CandidatesPage } from '@/features/candidates/CandidatesPage';
import { VisitJourneyPage } from '@/features/chatbot/VisitJourneyPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InvitationsPage } from '@/features/invitations/InvitationsPage';
import { PendingIssuesPage } from '@/features/pendencies/PendingIssuesPage';
import { ProfessorProfilePage, PromoterProfilePage } from '@/features/profiles/ProfilePages';
import { SettingsPage } from '@/features/settings/SettingsPage';
import {
  AdminVisitsPage,
  MyVisitsPage,
  VisitBriefingPage,
  VisitDetailPage,
} from '@/features/visits/VisitsPages';

function AppHomeRedirect() {
  const { me } = useAuth();
  if (!me) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRole(me.profile.role)} replace />;
}

function ProfileRoute() {
  const { role } = useAuth();
  if (role === 'professor') return <ProfessorProfilePage />;
  return <PromoterProfilePage />;
}

function VisitDetailRoute() {
  const { id = '' } = useParams();
  return <VisitDetailPage visitId={id} />;
}

function BriefingRoute() {
  const { id = '' } = useParams();
  return <VisitBriefingPage visitId={id} />;
}

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/visita/:campusSlug', element: <VisitJourneyPage /> },
      { path: '/minha-visita', element: <CandidatePortalPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <AppHomeRedirect /> },
      {
        path: 'pendencias',
        element: (
          <RequireRole roles={['admin']}>
            <PendingIssuesPage />
          </RequireRole>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <RequireRole roles={['admin']}>
            <DashboardPage />
          </RequireRole>
        ),
      },
      {
        path: 'calendario',
        element: (
          <RequireRole roles={['admin']}>
            <CalendarPage />
          </RequireRole>
        ),
      },
      {
        path: 'visitas',
        element: (
          <RequireRole roles={['admin']}>
            <AdminVisitsPage />
          </RequireRole>
        ),
      },
      {
        path: 'visitas/:id',
        element: (
          <RequireRole roles={['admin']}>
            <VisitDetailRoute />
          </RequireRole>
        ),
      },
      {
        path: 'candidatos',
        element: (
          <RequireRole roles={['admin']}>
            <CandidatesPage />
          </RequireRole>
        ),
      },
      {
        path: 'convocacoes',
        element: (
          <RequireRole roles={['promotor']}>
            <InvitationsPage title="Convocações" />
          </RequireRole>
        ),
      },
      {
        path: 'solicitacoes',
        element: (
          <RequireRole roles={['professor']}>
            <InvitationsPage title="Solicitações" />
          </RequireRole>
        ),
      },
      {
        path: 'minhas-visitas',
        element: (
          <RequireRole roles={['promotor', 'professor']}>
            <MyVisitsPage />
          </RequireRole>
        ),
      },
      {
        path: 'minhas-visitas/:id',
        element: (
          <RequireRole roles={['promotor', 'professor']}>
            <BriefingRoute />
          </RequireRole>
        ),
      },
      {
        path: 'disponibilidade',
        element: (
          <RequireRole roles={['promotor', 'professor']}>
            <AvailabilityPage />
          </RequireRole>
        ),
      },
      {
        path: 'meu-perfil',
        element: (
          <RequireRole roles={['promotor', 'professor']}>
            <ProfileRoute />
          </RequireRole>
        ),
      },
      {
        path: 'configuracoes',
        element: (
          <RequireRole roles={['admin']}>
            <SettingsPage />
          </RequireRole>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
