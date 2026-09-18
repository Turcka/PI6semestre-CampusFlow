import type { UserRole } from '@campusflow/shared';
import { NavLink, Outlet } from 'react-router-dom';

import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';

type NavItem = { to: string; label: string; roles: UserRole[] };

const NAV: NavItem[] = [
  { to: '/app/pendencias', label: 'Pendências', roles: ['admin'] },
  { to: '/app/dashboard', label: 'Dashboard', roles: ['admin'] },
  { to: '/app/calendario', label: 'Calendário', roles: ['admin'] },
  { to: '/app/visitas', label: 'Visitas', roles: ['admin'] },
  { to: '/app/candidatos', label: 'Candidatos', roles: ['admin'] },
  { to: '/app/convocacoes', label: 'Convocações', roles: ['promotor'] },
  { to: '/app/solicitacoes', label: 'Solicitações', roles: ['professor'] },
  { to: '/app/minhas-visitas', label: 'Minhas visitas', roles: ['promotor', 'professor'] },
  { to: '/app/disponibilidade', label: 'Disponibilidade', roles: ['promotor', 'professor'] },
  { to: '/app/meu-perfil', label: 'Meu perfil', roles: ['promotor', 'professor'] },
  { to: '/app/configuracoes', label: 'Configurações', roles: ['admin'] },
];

export function AppLayout() {
  const { me, signOut } = useAuth();
  const role = me?.profile.role;
  const items = NAV.filter((item) => role && item.roles.includes(role));

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="border-b border-slate-100 px-5 py-5">
          <p className="text-lg font-bold text-brand-800">CampusFlow</p>
          <p className="mt-1 truncate text-xs text-slate-500">{me?.tenant?.name}</p>
          <p className="mt-2 text-sm font-medium text-slate-800">{me?.profile.full_name}</p>
          <p className="text-xs capitalize text-slate-500">{me?.profile.role}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm font-medium ${
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-brand-800">CampusFlow</p>
              <p className="text-xs capitalize text-slate-500">{me?.profile.role}</p>
            </div>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-8">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-10 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white px-2 py-2 md:hidden">
          {items.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `min-w-[4.5rem] flex-1 rounded-xl px-2 py-2 text-center text-[11px] font-semibold ${
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-500'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
