import type { UserRole } from '@campusflow/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { v1Api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui';

export type AuthMe = {
  profile: {
    id: string;
    tenant_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    role: UserRole;
    avatar_url: string | null;
    is_active: boolean;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    logo_url: string | null;
  } | null;
  campuses: Array<{ id: string; name: string; slug: string }>;
  courseIds: string[];
};

type AuthContextValue = {
  me: AuthMe | null;
  loading: boolean;
  role: UserRole | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function homeForRole(role: UserRole) {
  if (role === 'admin') return '/app/pendencias';
  if (role === 'promotor') return '/app/convocacoes';
  return '/app/solicitacoes';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      try {
        return await v1Api<AuthMe>('/auth/me');
      } catch {
        return null;
      }
    },
    retry: false,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      me: meQuery.data ?? null,
      loading: meQuery.isLoading,
      role: meQuery.data?.profile.role ?? null,
      refresh: () => meQuery.refetch(),
      signOut: async () => {
        await supabase.auth.signOut();
        queryClient.setQueryData(queryKeys.me, null);
      },
    }),
    [meQuery, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  if (!roles.includes(me.profile.role)) return <Navigate to={homeForRole(me.profile.role)} replace />;
  return children;
}
