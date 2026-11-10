import { Link, Outlet } from 'react-router-dom';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe,_#f8fafc_45%,_#eff6ff)]">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" aria-label="CampusFlow — página inicial">
            <p className="text-lg font-bold tracking-tight text-brand-800">CampusFlow</p>
            <p className="text-xs text-slate-500">Agendamento inteligente de visitas</p>
          </Link>
          <Link to="/login" className="text-sm font-medium text-brand-700 hover:underline">
            Área da equipe
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
