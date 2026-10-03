import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Badge, Button, Card, EmptyState, FieldError, Input, Label, Spinner } from '@/components/ui';
import { ApiError, publicApi } from '@/lib/api';
import { saveCandidateSession, setPortalToken } from '@/lib/candidate-token';
import { formatDateTime, parseTstzrange } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type CandidateMe = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  preferred_focus: string | null;
  profile_summary: string | null;
  profile_completed_at: string | null;
  portal_token: string;
  campus_slug: string | null;
  session_id: string | null;
};

type CandidateVisit = {
  id: string;
  status: string;
  type: string;
  focus: string | null;
  period: string;
  promoter_id: string | null;
  created_at: string;
};

type LookupResult = {
  candidateId: string;
  fullName: string;
  email: string;
  portalToken: string;
};

const allowEmailLookup = import.meta.env.DEV || import.meta.env.VITE_ALLOW_PORTAL_EMAIL_LOOKUP === 'true';

export function CandidatePortalPage() {
  const [params, setParams] = useSearchParams();
  const [emailInput, setEmailInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const bootSeen = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const bootQuery = useQuery({
    queryKey: ['public', 'boot'],
    queryFn: () => publicApi<{ startedAt: string }>('/boot'),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    setPortalToken('');
    if (params.get('token')) setParams({}, { replace: true });
    // Só na abertura da página: não restaurar o candidato da visita anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const startedAt = bootQuery.data?.startedAt;
    if (!startedAt) return;
    if (bootSeen.current && bootSeen.current !== startedAt) {
      setToken(null);
      setTokenInput('');
      setAccessError(null);
    }
    bootSeen.current = startedAt;
  }, [bootQuery.data?.startedAt]);

  const meQuery = useQuery({
    queryKey: queryKeys.candidateMe(token ?? ''),
    queryFn: () => publicApi<CandidateMe>(`/candidates/me?token=${token}`),
    enabled: Boolean(token),
  });

  const visitsQuery = useQuery({
    queryKey: queryKeys.candidateVisits(token ?? ''),
    queryFn: () => publicApi<CandidateVisit[]>(`/candidates/me/visits?token=${token}`),
    enabled: Boolean(token),
  });

  const lookupMutation = useMutation({
    mutationFn: (email: string) =>
      publicApi<LookupResult>('/candidates/lookup-by-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    onSuccess: (data) => {
      setAccessError(null);
      setToken(data.portalToken);
    },
    onError: (err) => {
      setAccessError(err instanceof ApiError ? err.message : 'Não foi possível localizar a visita.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (visitId: string) =>
      publicApi(`/scheduling/visits/${visitId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ portalToken: token, reason: 'Cancelado pelo candidato' }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.candidateVisits(token ?? '') });
    },
  });

  const latest = useMemo(() => visitsQuery.data?.[0] ?? null, [visitsQuery.data]);
  const range = parseTstzrange(latest?.period);

  if (!token) {
    return (
      <Card className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Minha visita</h1>
        <p className="text-sm text-slate-600">
          {allowEmailLookup
            ? 'Informe o e-mail usado no cadastro para acompanhar a visita (modo teste).'
            : 'Cole o token recebido por e-mail ou continue uma sessão recente.'}
        </p>

        {allowEmailLookup ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="email">E-mail cadastrado</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </div>
            <Button
              disabled={!emailInput.trim() || lookupMutation.isPending}
              onClick={() => {
                setAccessError(null);
                lookupMutation.mutate(emailInput.trim().toLowerCase());
              }}
            >
              {lookupMutation.isPending ? 'Buscando…' : 'Acessar com e-mail'}
            </Button>
            <FieldError>{accessError}</FieldError>
            <p className="text-xs text-slate-500">Disponível apenas em ambiente de desenvolvimento/teste.</p>
          </div>
        ) : null}

        <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Acesso com portal token</summary>
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="token">Portal token</Label>
              <Input id="token" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const next = tokenInput.trim();
                if (next) setToken(next);
              }}
            >
              Acessar com token
            </Button>
          </div>
        </details>

        <Link className="text-sm text-brand-700 hover:underline" to="/visita/sao-caetano">
          Ou agendar uma nova visita
        </Link>
      </Card>
    );
  }

  if (meQuery.isLoading || visitsQuery.isLoading) return <Spinner />;

  if (meQuery.isError || !meQuery.data) {
    return (
      <EmptyState
        title="Não encontramos sua visita"
        description="O e-mail ou token pode estar inválido. Tente novamente ou inicie um novo agendamento."
        action={
            <Button
            onClick={() => {
              setToken(null);
              setTokenInput('');
              setPortalToken('');
            }}
          >
            Tentar de novo
          </Button>
        }
      />
    );
  }

  const me = meQuery.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Olá, {me.full_name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-600">Acompanhe o status da sua visita e gerencie o horário.</p>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold text-slate-900">Seu perfil</h2>
        <p className="text-sm text-slate-600">{me.email}</p>
        {me.preferred_focus ? <Badge status="confirmada">Foco: {me.preferred_focus}</Badge> : null}
        {me.profile_summary ? <p className="text-sm text-slate-700">{me.profile_summary}</p> : null}
      </Card>

      {latest ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Visita atual</h2>
            <Badge status={latest.status} />
          </div>
          {range ? <p className="text-lg font-semibold">{formatDateTime(range.start)}</p> : null}
          <p className="text-sm text-slate-600">
            Status: {latest.status.replaceAll('_', ' ')}. Você será avisado por e-mail a cada mudança importante.
          </p>
          {!['cancelada', 'realizada', 'ausente'].includes(latest.status) ? (
            <Button
              variant="danger"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (confirm('Deseja cancelar esta visita?')) cancelMutation.mutate(latest.id);
              }}
            >
              Cancelar visita
            </Button>
          ) : null}
          {cancelMutation.isError ? (
            <p className="text-sm text-rose-600">{(cancelMutation.error as Error).message}</p>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          title="Nenhuma visita encontrada"
          description="Seu cadastro e questionário já estão salvos. Continue escolhendo um horário."
          action={
            <Button
              onClick={() => {
                const campusSlug = me.campus_slug ?? 'sao-caetano';
                const resumeStep = me.profile_completed_at ? 3 : me.session_id ? 1 : 0;
                saveCandidateSession({
                  sessionId: me.session_id ?? '',
                  portalToken: me.portal_token,
                  candidateId: me.id,
                  campusSlug,
                  step: resumeStep,
                  profileSummary: me.profile_summary,
                });
                navigate(`/visita/${campusSlug}`);
              }}
            >
              Agendar agora
            </Button>
          }
        />
      )}

      <Card>
        <h2 className="mb-3 font-semibold text-slate-900">Histórico</h2>
        <ul className="space-y-2">
          {(visitsQuery.data ?? []).map((visit) => {
            const visitRange = parseTstzrange(visit.period);
            return (
              <li key={visit.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                <span>{visitRange ? formatDateTime(visitRange.start) : visit.id}</span>
                <Badge status={visit.status} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
