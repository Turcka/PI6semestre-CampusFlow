import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { v1Api } from '@/lib/api';
import { formatDateTime, parseTstzrange } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type VisitRow = {
  id: string;
  status: string;
  period: string;
  pendingIssues?: string[];
  candidates?: { full_name?: string } | null;
};

type Paginated<T> = { data: T[]; total: number };

export function PendingIssuesPage() {
  const visitsQuery = useQuery({
    queryKey: queryKeys.visits({ pending: '1' }),
    queryFn: () => v1Api<Paginated<VisitRow>>('/visits?pageSize=100'),
    refetchInterval: 15_000,
  });

  if (visitsQuery.isLoading) return <Spinner />;

  const pending = (visitsQuery.data?.data ?? []).filter(
    (visit) =>
      (visit.pendingIssues ?? []).length > 0 ||
      ['aguardando_promotor', 'aguardando_professor', 'agendada'].includes(visit.status),
  );

  const groups = {
    sem_promotor: pending.filter((v) => (v.pendingIssues ?? []).includes('sem_promotor')),
    aguardando_professor: pending.filter((v) => v.status === 'aguardando_professor'),
    convite_pendente: pending.filter((v) => (v.pendingIssues ?? []).includes('convite_pendente')),
    outros: pending.filter(
      (v) =>
        !(v.pendingIssues ?? []).includes('sem_promotor') &&
        v.status !== 'aguardando_professor' &&
        !(v.pendingIssues ?? []).includes('convite_pendente'),
    ),
  };

  return (
    <div>
      <PageHeader
        title="Central de pendências"
        description="Visitas que precisam de atenção do time administrativo."
        actions={
          <Link to="/app/visitas">
            <Button variant="secondary">Ver todas as visitas</Button>
          </Link>
        }
      />

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
                  return (
                    <Card key={visit.id} className="flex flex-wrap items-center justify-between gap-3">
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
