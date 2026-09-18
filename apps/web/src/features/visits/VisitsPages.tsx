import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Badge, Button, Card, EmptyState, PageHeader, ScoreBar, Spinner } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { v1Api } from '@/lib/api';
import { formatDateTime, parseTstzrange } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type VisitRow = {
  id: string;
  status: string;
  focus: string | null;
  period: string;
  promoter_id: string | null;
  professor_id: string | null;
  candidates?: { full_name?: string; email?: string; cpf?: string } | null;
  pendingIssues?: string[];
  match_runs?: { match_results?: Array<{ score?: number; justification?: string; is_selected?: boolean }> } | null;
};

type Paginated<T> = { data: T[]; page: number; pageSize: number; total: number };

export function MyVisitsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();

  const visitsQuery = useQuery({
    queryKey: queryKeys.visits({ scope: 'mine' }),
    queryFn: () => v1Api<Paginated<VisitRow>>('/visits?pageSize=50'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      v1Api(`/visits/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.visits({ scope: 'mine' }) });
    },
  });

  if (visitsQuery.isLoading) return <Spinner />;
  const rows = visitsQuery.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Minhas visitas"
        description={role === 'professor' ? 'Visitas em que você participa como professor.' : 'Visitas atribuídas a você.'}
      />
      {!rows.length ? (
        <EmptyState title="Nenhuma visita" description="Assim que aceitar um convite, a visita aparecerá aqui." />
      ) : (
        <div className="space-y-3">
          {rows.map((visit) => {
            const range = parseTstzrange(visit.period);
            return (
              <Card key={visit.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{visit.candidates?.full_name ?? 'Candidato'}</p>
                    <p className="text-sm text-slate-600">{range ? formatDateTime(range.start) : '—'}</p>
                  </div>
                  <Badge status={visit.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/app/minhas-visitas/${visit.id}`}>
                    <Button variant="secondary">Abrir briefing</Button>
                  </Link>
                  {role === 'promotor' && visit.status === 'confirmada' ? (
                    <Button onClick={() => statusMutation.mutate({ id: visit.id, status: 'em_atendimento' })}>
                      Iniciar atendimento
                    </Button>
                  ) : null}
                  {role === 'promotor' && visit.status === 'em_atendimento' ? (
                    <Button onClick={() => statusMutation.mutate({ id: visit.id, status: 'realizada' })}>
                      Concluir
                    </Button>
                  ) : null}
                  {role === 'promotor' && ['confirmada', 'em_atendimento'].includes(visit.status) ? (
                    <Button
                      variant="danger"
                      onClick={() => statusMutation.mutate({ id: visit.id, status: 'ausente' })}
                    >
                      Marcar ausência
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function VisitBriefingPage({ visitId }: { visitId: string }) {
  const briefingQuery = useQuery({
    queryKey: [...queryKeys.visit(visitId), 'briefing'],
    queryFn: () =>
      v1Api<{
        visitId: string;
        status: string;
        focus: string | null;
        candidate: {
          firstName?: string;
          preferredFocus?: string | null;
          profileSummary?: string | null;
          interests?: unknown;
        } | null;
        itinerary: unknown[];
        professorId: string | null;
      }>(`/visits/${visitId}/briefing`),
  });

  if (briefingQuery.isLoading) return <Spinner />;
  if (!briefingQuery.data) return <p className="text-rose-600">Briefing indisponível.</p>;
  const data = briefingQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Preparação da visita" description="Use este painel no celular durante o tour." />
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{data.candidate?.firstName ?? 'Candidato'}</h2>
          <Badge status={data.status} />
        </div>
        {data.focus ? <p className="text-sm text-slate-600">Foco: {data.focus}</p> : null}
        {data.candidate?.profileSummary ? (
          <p className="text-sm text-slate-700">{data.candidate.profileSummary}</p>
        ) : null}
        {data.professorId ? <p className="text-sm text-slate-600">Professor vinculado a esta visita.</p> : null}
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Roteiro</h3>
        {(data.itinerary as unknown[]).length ? (
          <p className="text-sm text-slate-600">{(data.itinerary as unknown[]).length} item(ns) no roteiro.</p>
        ) : (
          <p className="text-sm text-slate-500">Roteiro ainda não gerado para esta visita.</p>
        )}
      </Card>
    </div>
  );
}

export function AdminVisitsPage() {
  const visitsQuery = useQuery({
    queryKey: queryKeys.visits({ scope: 'admin' }),
    queryFn: () => v1Api<Paginated<VisitRow>>('/visits?pageSize=50'),
  });

  if (visitsQuery.isLoading) return <Spinner />;
  const rows = visitsQuery.data?.data ?? [];

  return (
    <div>
      <PageHeader title="Visitas" description="Visão operacional com status e pendências." />
      {!rows.length ? (
        <EmptyState title="Sem visitas" description="Quando houver agendamentos, eles aparecerão nesta lista." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Candidato</th>
                <th className="px-4 py-3">Horário</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pendências</th>
                <th className="px-4 py-3">Match</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((visit) => {
                const range = parseTstzrange(visit.period);
                const selected = visit.match_runs?.match_results?.find((r) => r.is_selected);
                return (
                  <tr key={visit.id} className="border-b border-slate-50">
                    <td className="px-4 py-3">
                      <Link className="font-medium text-brand-700 hover:underline" to={`/app/visitas/${visit.id}`}>
                        {visit.candidates?.full_name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{range ? formatDateTime(range.start) : '—'}</td>
                    <td className="px-4 py-3">
                      <Badge status={visit.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {(visit.pendingIssues ?? []).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 min-w-[8rem]">
                      {selected?.score != null ? <ScoreBar score={Number(selected.score)} /> : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function VisitDetailPage({ visitId }: { visitId: string }) {
  const detailQuery = useQuery({
    queryKey: queryKeys.visit(visitId),
    queryFn: () => v1Api<Record<string, unknown>>(`/visits/${visitId}`),
  });

  if (detailQuery.isLoading) return <Spinner />;
  if (!detailQuery.data) return <p className="text-rose-600">Visita não encontrada.</p>;

  const visit = detailQuery.data;
  const candidate = visit.candidates as { full_name?: string; profile_summary?: string } | null;
  const matchRun = visit.match_runs as
    | { match_results?: Array<{ score: number; justification?: string; is_selected?: boolean; promoter_id?: string }> }
    | null;

  return (
    <div className="space-y-4">
      <PageHeader title={candidate?.full_name ?? 'Detalhe da visita'} description={`Status: ${String(visit.status)}`} />
      <Card className="space-y-2">
        <h2 className="font-semibold">Resumo</h2>
        <p className="text-sm text-slate-600">{candidate?.profile_summary ?? 'Sem resumo.'}</p>
        <Badge status={String(visit.status)} />
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Match</h2>
        {(matchRun?.match_results ?? []).map((result, index) => (
          <div key={`${result.promoter_id}-${index}`} className="space-y-1 rounded-xl border border-slate-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Promotor {result.promoter_id?.slice(0, 8)}</p>
              {result.is_selected ? <Badge status="confirmada">Selecionado</Badge> : null}
            </div>
            <ScoreBar score={Number(result.score)} />
            <p className="text-xs text-slate-600">{result.justification}</p>
          </div>
        ))}
        {!(matchRun?.match_results ?? []).length ? (
          <p className="text-sm text-slate-500">Sem ranking de match persistido.</p>
        ) : null}
      </Card>
    </div>
  );
}
