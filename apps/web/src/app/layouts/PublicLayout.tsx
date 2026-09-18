import { Outlet } from 'react-router-dom';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe,_#f8fafc_45%,_#eff6ff)]">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-lg font-bold tracking-tight text-brand-800">CampusFlow</p>
            <p className="text-xs text-slate-500">Agendamento inteligente de visitas</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
