import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';

import { NAV, TopNav } from './TopNav';

export function AppLayout() {
  const { me } = useAuth();
  const role = me?.profile.role;
  const items = NAV.filter((item) => role && item.roles.includes(role));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopNav />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">
        <Outlet />
      </main>

      {/* Atalhos rápidos no mobile; o menu completo fica no botão ☰ do topo. */}
      <nav
        aria-label="Atalhos"
        className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white px-2 py-2 md:hidden"
      >
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
  );
}
