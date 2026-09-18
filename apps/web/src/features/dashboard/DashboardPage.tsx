import { useQuery } from '@tanstack/react-query';
import { addDays, startOfDay } from 'date-fns';

import { Card, PageHeader, Spinner } from '@/components/ui';
import { v1Api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function DashboardPage() {
  const from = startOfDay(addDays(new Date(), -30)).toISOString().slice(0, 10);
  const to = startOfDay(addDays(new Date(), 1)).toISOString().slice(0, 10);

  const overviewQuery = useQuery({
    queryKey: queryKeys.analyticsOverview({ from, to }),
    queryFn: () => v1Api<unknown[]>(`/analytics/overview?from=${from}&to=${to}`),
  });

  const visitsQuery = useQuery({
    queryKey: queryKeys.visits({ dash: '1' }),
    queryFn: () => v1Api<{ data: Array<{ status: string }>; total: number }>('/visits?pageSize=200'),
  });

  if (overviewQuery.isLoading || visitsQuery.isLoading) return <Spinner />;

  const byStatus = (visitsQuery.data?.data ?? []).reduce<Record<string, number>>((acc, visit) => {
    acc[visit.status] = (acc[visit.status] ?? 0) + 1;
    return acc;
  }, {});

  const cards = [
    { label: 'Total listado', value: visitsQuery.data?.total ?? 0 },
    { label: 'Aguardando promotor', value: byStatus.aguardando_promotor ?? 0 },
    { label: 'Confirmadas', value: byStatus.confirmada ?? 0 },
    { label: 'Realizadas', value: byStatus.realizada ?? 0 },
    { label: 'Ausentes', value: byStatus.ausente ?? 0 },
    { label: 'Canceladas', value: byStatus.cancelada ?? 0 },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Indicadores operacionais dos últimos 30 dias (visão rápida)." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{card.value}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <h2 className="mb-2 font-semibold">Analytics (vw_visits_kpis)</h2>
        <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(overviewQuery.data ?? [], null, 2)}
        </pre>
      </Card>
    </div>
  );
}
