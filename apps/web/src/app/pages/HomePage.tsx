import { Link } from 'react-router-dom';

import { Button, Card } from '@/components/ui';
import { homeForRole, useAuth } from '@/features/auth/AuthProvider';

export function HomePage() {
  const { me, loading } = useAuth();

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center gap-8 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">CampusFlow</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Visitas ao campus com match inteligente
        </h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600">
          Candidatos passam por um questionário guiado; a plataforma encontra o promotor certo e organiza o aceite
          com a equipe.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Sou candidato</h2>
          <p className="text-sm text-slate-600">Cadastre-se, responda o chatbot e escolha um horário.</p>
          <Link to="/visita/sao-caetano">
            <Button className="w-full">Agendar visita · São Caetano</Button>
          </Link>
          <Link to="/minha-visita" className="block text-center text-sm font-medium text-brand-700 hover:underline">
            Já agendei — acompanhar visita
          </Link>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Sou da instituição</h2>
          <p className="text-sm text-slate-600">Admin, promotor ou professor.</p>
          {loading ? (
            <Button className="w-full" disabled>
              Verificando sessão…
            </Button>
          ) : me ? (
            <Link to={homeForRole(me.profile.role)}>
              <Button className="w-full">Ir para o painel</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button className="w-full">Entrar</Button>
            </Link>
          )}
        </Card>
      </div>
    </div>
  );
}
