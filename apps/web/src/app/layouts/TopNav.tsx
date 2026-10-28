import type { UserRole } from '@campusflow/shared';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { Button, Drawer } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';

export type NavItem = { to: string; label: string; roles: UserRole[] };

export const NAV: NavItem[] = [
  { to: '/app/pendencias', label: 'Pendências', roles: ['admin'] },
  { to: '/app/dashboard', label: 'Dashboard', roles: ['admin'] },
  { to: '/app/calendario', label: 'Calendário', roles: ['admin'] },
  { to: '/app/visitas', label: 'Visitas', roles: ['admin'] },
  { to: '/app/candidatos', label: 'Candidatos', roles: ['admin'] },
  { to: '/app/configuracoes', label: 'Configurações', roles: ['admin'] },
  { to: '/app/convocacoes', label: 'Convocações', roles: ['promotor'] },
  { to: '/app/solicitacoes', label: 'Solicitações', roles: ['professor'] },
  { to: '/app/minhas-visitas', label: 'Minhas visitas', roles: ['promotor', 'professor'] },
  { to: '/app/disponibilidade', label: 'Disponibilidade', roles: ['promotor', 'professor'] },
  { to: '/app/meu-perfil', label: 'Meu perfil', roles: ['promotor', 'professor'] },
];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  promotor: 'Promotor',
  professor: 'Professor',
};

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  if (url) {
    return <img src={url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" />;
  }
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
      {initials || '?'}
    </span>
  );
}

/**
 * Menu principal fixo no topo de todas as telas autenticadas.
 * Logo leva à home do papel (`/app`); itens horizontais no desktop e Drawer no mobile.
 */
export function TopNav({ banner }: { banner?: ReactNode }) {
  const { me, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const role = me?.profile.role;
  const items = NAV.filter((item) => role && item.roles.includes(role));

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${
      isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 md:px-8">
        <Link
          to="/app"
          className="flex shrink-0 flex-col rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label="CampusFlow — página inicial"
        >
          <span className="text-lg font-bold leading-tight tracking-tight text-brand-800">CampusFlow</span>
          <span className="hidden truncate text-[11px] text-slate-500 sm:block">{me?.tenant?.name}</span>
        </Link>

        <nav aria-label="Menu principal" className="mx-2 hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} aria-current={location.pathname.startsWith(item.to) ? 'page' : undefined}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <Avatar name={me?.profile.full_name ?? ''} url={me?.profile.avatar_url ?? null} />
            <div className="leading-tight">
              <p className="max-w-[12rem] truncate text-sm font-medium text-slate-800">{me?.profile.full_name}</p>
              <p className="text-xs text-slate-500">{role ? ROLE_LABEL[role] : ''}</p>
            </div>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 md:hidden"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {banner}

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="right" widthClassName="sm:max-w-xs">
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={me?.profile.full_name ?? ''} url={me?.profile.avatar_url ?? null} />
          <div className="leading-tight">
            <p className="text-sm font-medium text-slate-800">{me?.profile.full_name}</p>
            <p className="text-xs text-slate-500">{role ? ROLE_LABEL[role] : ''}</p>
          </div>
        </div>
        <nav aria-label="Menu principal" className="flex flex-col gap-1">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setMenuOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 border-t border-slate-100 pt-4">
          <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </Drawer>
    </header>
  );
}
