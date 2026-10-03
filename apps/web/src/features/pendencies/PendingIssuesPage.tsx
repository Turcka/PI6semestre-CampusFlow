import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card, EmptyState, FieldError, Label, PageHeader, Select, Spinner } from '@/components/ui';
import { ApiError, v1Api } from '@/lib/api';
import { formatDateTime, parseTstzrange } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type VisitRow = {
  id: string;
  status: string;
  period: string;
  promoter_id: string | null;
  professor_id: string | null;
  pendingIssues?: string[];
  candidates?: { full_name?: string } | null;
};

type Staff = { id: string; full_name: string; role: string };
type Paginated<T> = { data: T[]; total: number };

export function PendingIssuesPage() {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Record<string, { promoterId: string; professorId: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const visitsQuery = useQuery({
    queryKey: queryKeys.visits({ pending: '1' }),
    queryFn: () => v1Api<Paginated<VisitRow>>('/visits?pageSize=100'),
    refetchInterval: 15_000,
  });

  const staffQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => v1Api<Paginated<Staff>>('/users?pageSize=100'),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, promoterId, professorId }: { id: string; promoterId: string; professorId: string }) =>
      v1Api(`/visits/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          promoterId,
          professorId: professorId || null,
        }),
      }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Não foi possível resolver a pendência.');
    },
  });

  if (visitsQuery.isLoading || staffQuery.isLoading) return <Spinner />;

  const promoters = (staffQuery.data?.data ?? []).filter((user) => user.role === 'promotor');
  const professors = (staffQuery.data?.data ?? []).filter((user) => user.role === 'professor');

  const pending = (visitsQuery.data?.data ?? []).filter(
    (visit) =>
      (visit.pendingIssues ?? []).length > 0 ||
      ['aguardando_promotor', 'aguardando_professor', 'agendada'].includes(visit.status),
  );

  const groups = {
    sem_promotor: pending.filter((v) => (v.pendingIssues ?? []).includes('sem_promotor')),
    aguardando_professor: pending.filter(
      (v) => v.status === 'aguardando_professor' && !(v.pendingIssues ?? []).includes('sem_promotor'),
    ),
    convite_pendente: pending.filter(
      (v) =>
        (v.pendingIssues ?? []).includes('convite_pendente') &&
        !(v.pendingIssues ?? []).includes('sem_promotor') &&
        v.status !== 'aguardando_professor',
    ),
    outros: pending.filter(
      (v) =>
        !(v.pendingIssues ?? []).includes('sem_promotor') &&
        v.status !== 'aguardando_professor' &&
        !(v.pendingIssues ?? []).includes('convite_pendente'),
    ),
  };

  function selectionFor(visit: VisitRow) {
    return (
      choice[visit.id] ?? {
        promoterId: visit.promoter_id ?? promoters[0]?.id ?? '',
        professorId: visit.professor_id ?? '',
      }
    );
  }

  return (
    <div>
      <PageHeader
        title="Central de pendências"
        description="Escolha o promotor e, se quiser, o professor. A visita fica confirmada na hora."
        actions={
          <Link to="/app/visitas">
            <Button variant="secondary">Ver todas as visitas</Button>
          </Link>
        }
      />

      {error ? <FieldError>{error}</FieldError> : null}

      {!pending.length ? (
        <EmptyState title="Tudo em dia" description="Não há visitas pendentes no momento." />
      ) : (
        <div className="space-y-6">
          {(
            [
              ['sem_promotor', 'Sem promotor'],
              ['aguardando_professor', 'Aguardando professor'],
              ['convite_pendente', 'Convite pendente'],
              ['outros', 'Outras'],
            ] as const
          ).map(([key, label]) =>
            groups[key].length ? (
              <section key={key} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</h2>
                {groups[key].map((visit) => {
                  const range = parseTstzrange(visit.period);
                  const selected = selectionFor(visit);
                  return (
                    <Card key={visit.id} className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{visit.candidates?.full_name ?? 'Visita'}</p>
                          <p className="text-sm text-slate-600">{range ? formatDateTime(range.start) : '—'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge status={visit.status} />
                          <Link to={`/app/visitas/${visit.id}`}>
                            <Button variant="secondary">Abrir</Button>
                          </Link>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor={`promoter-${visit.id}`}>Promotor</Label>
                          <Select
                            id={`promoter-${visit.id}`}
                            value={selected.promoterId}
                            onChange={(event) =>
                              setChoice((current) => ({
                                ...current,
                                [visit.id]: { ...selected, promoterId: event.target.value },
                              }))
                            }
                          >
                            <option value="">Selecione</option>
                            {promoters.map((promoter) => (
                              <option key={promoter.id} value={promoter.id}>
                                {promoter.full_name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor={`professor-${visit.id}`}>Professor</Label>
                          <Select
                            id={`professor-${visit.id}`}
                            value={selected.professorId}
                            onChange={(event) =>
                              setChoice((current) => ({
                                ...current,
                                [visit.id]: { ...selected, professorId: event.target.value },
                              }))
                            }
                          >
                            <option value="">Sem professor</option>
                            {professors.map((professor) => (
                              <option key={professor.id} value={professor.id}>
                                {professor.full_name}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                      <Button
                        disabled={!selected.promoterId || resolveMutation.isPending}
                        onClick={() =>
                          resolveMutation.mutate({
                            id: visit.id,
                            promoterId: selected.promoterId,
                            professorId: selected.professorId,
                          })
                        }
                      >
                        {resolveMutation.isPending ? 'Salvando…' : 'Resolver pendência'}
                      </Button>
                    </Card>
                  );
                })}
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
