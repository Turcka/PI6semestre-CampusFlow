import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge, Button, Card, EmptyState, Input, Label, Spinner } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { getPortalToken, setPortalToken } from '@/lib/candidate-token';
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

export function CandidatePortalPage() {
  const [params, setParams] = useSearchParams();
  const tokenFromUrl = params.get('token');
  const stored = getPortalToken();
  const [tokenInput, setTokenInput] = useState(tokenFromUrl ?? stored ?? '');
  const token = tokenFromUrl ?? stored;
  const queryClient = useQueryClient();

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
        <p className="text-sm text-slate-600">Cole o token recebido por e-mail ou continue uma sessão recente.</p>
        <div>
          <Label htmlFor="token">Portal token</Label>
          <Input id="token" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
        </div>
        <Button
          onClick={() => {
            setPortalToken(tokenInput.trim());
            setParams({ token: tokenInput.trim() });
          }}
        >
          Acessar
        </Button>
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
        description="O token pode estar inválido. Tente novamente ou inicie um novo agendamento."
        action={
          <Link to="/visita/sao-caetano">
            <Button>Agendar visita</Button>
          </Link>
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
          description="Você ainda não possui visitas neste portal."
          action={
            <Link to="/visita/sao-caetano">
              <Button>Agendar agora</Button>
            </Link>
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
