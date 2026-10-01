import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button, Card, FieldError, Input, Label } from '@/components/ui';
import { homeForRole, useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

const DEV_ACCOUNTS = [
  { email: 'admin@campusflow.local', role: 'Admin', password: 'CampusFlow123!' },
  { email: 'promotor@campusflow.local', role: 'Promotor', password: 'CampusFlow123!' },
  { email: 'professor@campusflow.local', role: 'Professor', password: 'CampusFlow123!' },
] as const;

export function LoginPage() {
  const { me, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && me) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from || homeForRole(me.profile.role)} replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
    if (signError) {
      setError(signError.message);
      setSubmitting(false);
      return;
    }
    await refresh();
    setSubmitting(false);
    navigate('/app');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-brand-50 to-sky-50 px-4 py-10">
      <Card className="w-full max-w-md">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">CampusFlow</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Entrar na plataforma</h1>
          <p className="mt-1 text-sm text-slate-600">Acesso para admin, promotor e professor.</p>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contas de desenvolvimento</p>
          <ul className="mt-3 space-y-2">
            {DEV_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  className="w-full rounded-xl bg-white px-3 py-2 text-left text-sm shadow-sm ring-1 ring-slate-200 hover:ring-brand-400"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                  }}
                >
                  <span className="font-medium text-slate-900">{account.role}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{account.email}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Senha: <code className="rounded bg-white px-1">CampusFlow123!</code> · rode{' '}
            <code className="rounded bg-white px-1">npm run seed:users</code> se ainda não criou.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Candidato?{' '}
          <Link className="font-medium text-brand-700 hover:underline" to="/visita/sao-caetano">
            Agendar visita
          </Link>
        </p>
      </Card>
    </div>
  );
}
