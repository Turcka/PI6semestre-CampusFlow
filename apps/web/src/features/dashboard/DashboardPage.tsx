import { useQuery } from '@tanstack/react-query';
import { addDays, format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { ApiError, v1Api } from '@/lib/api';
import { formatPercent } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type KpiRow = {
  course_id: string | null;
  promoter_id: string | null;
  day: string;
  agendadas: number | string;
  confirmadas: number | string;
  realizadas: number | string;
  ausentes: number | string;
  canceladas: number | string;
  reagendadas: number | string;
};

type VisitRow = { status: string };
type Course = { id: string; name: string };
type Staff = { id: string; full_name: string; role: string };

const COUNT_KEYS = ['agendadas', 'confirmadas', 'realizadas', 'ausentes', 'canceladas', 'reagendadas'] as const;

function num(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageOf(error: unknown) {
  return error instanceof ApiError ? error.message : 'Não foi possível carregar os indicadores.';
}

export function DashboardPage() {
  const range = useMemo(() => {
    const start = startOfDay(addDays(new Date(), -30));
    const end = startOfDay(addDays(new Date(), 90));
    return {
      from: format(start, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
      label: `${format(start, "dd 'de' MMMM", { locale: ptBR })} a ${format(end, "dd 'de' MMMM", { locale: ptBR })}`,
    };
  }, []);

  const overviewQuery = useQuery({
    queryKey: queryKeys.analyticsOverview({ from: range.from, to: range.to }),
    queryFn: () => v1Api<KpiRow[]>(`/analytics/overview?from=${range.from}&to=${range.to}`),
  });

  const visitsQuery = useQuery({
    queryKey: queryKeys.visits({ dash: '1' }),
    queryFn: () => v1Api<{ data: VisitRow[]; total: number }>('/visits?pageSize=100'),
  });

  const coursesQuery = useQuery({
    queryKey: queryKeys.courses(),
    queryFn: () => v1Api<Course[]>('/courses'),
  });

  const staffQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => v1Api<{ data: Staff[] }>('/users?pageSize=100'),
  });

  const rows = overviewQuery.data ?? [];
  const totals = useMemo(() => {
    const sum = { agendadas: 0, confirmadas: 0, realizadas: 0, ausentes: 0, canceladas: 0, reagendadas: 0 };
    for (const row of rows) {
      for (const key of COUNT_KEYS) sum[key] += num(row[key]);
    }
    const attended = sum.realizadas + sum.ausentes;
    return {
      ...sum,
      comparecimento: attended > 0 ? sum.realizadas / attended : null,
      cancelamento: sum.agendadas + sum.canceladas > 0 ? sum.canceladas / (sum.agendadas + sum.canceladas) : null,
      reagendamento: sum.agendadas + sum.canceladas > 0 ? sum.reagendadas / (sum.agendadas + sum.canceladas) : null,
    };
  }, [rows]);

  const byDay = useMemo(() => {
    const map = new Map<string, { day: string; label: string; agendadas: number; confirmadas: number; realizadas: number }>();
    for (const row of rows) {
      const current = map.get(row.day) ?? {
        day: row.day,
        label: format(new Date(`${row.day}T12:00:00`), 'dd/MM', { locale: ptBR }),
        agendadas: 0,
        confirmadas: 0,
        realizadas: 0,
      };
      current.agendadas += num(row.agendadas);
      current.confirmadas += num(row.confirmadas);
      current.realizadas += num(row.realizadas);
      map.set(row.day, current);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [rows]);

  const courseName = useMemo(() => {
    const map = new Map((coursesQuery.data ?? []).map((course) => [course.id, course.name]));
    return (id: string | null) => (id ? map.get(id) ?? 'Curso' : 'Sem curso');
  }, [coursesQuery.data]);

  const promoterName = useMemo(() => {
    const map = new Map((staffQuery.data?.data ?? []).map((user) => [user.id, user.full_name]));
    return (id: string | null) => (id ? map.get(id) ?? 'Promotor' : 'Sem promotor');
  }, [staffQuery.data]);

  const byCourse = useMemo(() => {
    const map = new Map<string, { id: string; name: string; agendadas: number; confirmadas: number; realizadas: number }>();
    for (const row of rows) {
      const id = row.course_id ?? 'none';
      const current = map.get(id) ?? { id, name: courseName(row.course_id), agendadas: 0, confirmadas: 0, realizadas: 0 };
      current.agendadas += num(row.agendadas);
      current.confirmadas += num(row.confirmadas);
      current.realizadas += num(row.realizadas);
      map.set(id, current);
    }
    return [...map.values()].sort((a, b) => b.agendadas - a.agendadas);
  }, [rows, courseName]);

  const byPromoter = useMemo(() => {
    const map = new Map<string, { id: string; name: string; agendadas: number; confirmadas: number; realizadas: number; ausentes: number }>();
    for (const row of rows) {
      const id = row.promoter_id ?? 'none';
      const current = map.get(id) ?? {
        id,
        name: promoterName(row.promoter_id),
        agendadas: 0,
        confirmadas: 0,
        realizadas: 0,
        ausentes: 0,
      };
      current.agendadas += num(row.agendadas);
      current.confirmadas += num(row.confirmadas);
      current.realizadas += num(row.realizadas);
      current.ausentes += num(row.ausentes);
      map.set(id, current);
    }
    return [...map.values()].sort((a, b) => b.agendadas - a.agendadas);
  }, [rows, promoterName]);

  const queue = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const visit of visitsQuery.data?.data ?? []) {
      counts[visit.status] = (counts[visit.status] ?? 0) + 1;
    }
    return counts;
  }, [visitsQuery.data]);

  if (overviewQuery.isLoading && visitsQuery.isLoading) return <Spinner />;

  const cards = [
    { label: 'Agendadas', value: totals.agendadas, hint: 'Visitas no período, exceto canceladas' },
    { label: 'Confirmadas', value: totals.confirmadas, hint: 'Equipe definida' },
    { label: 'Realizadas', value: totals.realizadas, hint: 'Tour concluído' },
    { label: 'Ausentes', value: totals.ausentes, hint: 'Candidato não compareceu' },
    { label: 'Canceladas', value: totals.canceladas, hint: 'Fora da operação' },
    { label: 'Reagendadas', value: totals.reagendadas, hint: 'Mudaram de horário' },
    { label: 'Aguardando promotor', value: queue.aguardando_promotor ?? 0, hint: 'Fila atual' },
    { label: 'Aguardando professor', value: queue.aguardando_professor ?? 0, hint: 'Fila atual' },
  ];

  const rates = [
    { label: 'Comparecimento', value: totals.comparecimento },
    { label: 'Cancelamento', value: totals.cancelamento },
    { label: 'Reagendamento', value: totals.reagendamento },
  ];

  const hasData = rows.length > 0 || (visitsQuery.data?.total ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`Indicadores de ${range.label}.`} />

      {overviewQuery.isError ? <p className="text-sm text-rose-600">{messageOf(overviewQuery.error)}</p> : null}
      {visitsQuery.isError ? <p className="text-sm text-rose-600">{messageOf(visitsQuery.error)}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="space-y-1">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="text-3xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-400">{card.hint}</p>
          </Card>
        ))}
      </div>

      {!hasData && !overviewQuery.isLoading ? (
        <EmptyState title="Sem visitas no período" description="Quando houver agendamentos, os indicadores aparecem aqui." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <h2 className="font-semibold text-slate-900">Visitas por dia</h2>
            <p className="mb-4 text-sm text-slate-500">Agendadas, confirmadas e realizadas.</p>
            {byDay.length ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byDay}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="agendadas" name="Agendadas" fill="#93c5fd" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="confirmadas" name="Confirmadas" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="realizadas" name="Realizadas" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nenhum dia com visita neste intervalo.</p>
            )}
          </Card>

          <Card className="space-y-5">
            <div>
              <h2 className="font-semibold text-slate-900">Taxas</h2>
              <p className="text-sm text-slate-500">Calculadas sobre o período.</p>
            </div>
            {rates.map((rate) => (
              <div key={rate.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{rate.label}</span>
                  <span className="font-semibold text-slate-900">{formatPercent(rate.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${Math.round((rate.value ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-4 text-sm text-slate-600">
              <p>Em atendimento agora: {queue.em_atendimento ?? 0}</p>
              <p>Total listado na operação: {visitsQuery.data?.total ?? 0}</p>
            </div>
          </Card>
        </div>
      )}

      {byCourse.length ? (
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">Por curso</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Curso</th>
                  <th className="py-2 pr-4">Agendadas</th>
                  <th className="py-2 pr-4">Confirmadas</th>
                  <th className="py-2">Realizadas</th>
                </tr>
              </thead>
              <tbody>
                {byCourse.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-900">{row.name}</td>
                    <td className="py-3 pr-4">{row.agendadas}</td>
                    <td className="py-3 pr-4">{row.confirmadas}</td>
                    <td className="py-3">{row.realizadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {byPromoter.length ? (
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">Por promotor</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Promotor</th>
                  <th className="py-2 pr-4">Agendadas</th>
                  <th className="py-2 pr-4">Confirmadas</th>
                  <th className="py-2 pr-4">Realizadas</th>
                  <th className="py-2">Ausentes</th>
                </tr>
              </thead>
              <tbody>
                {byPromoter.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-900">{row.name}</td>
                    <td className="py-3 pr-4">{row.agendadas}</td>
                    <td className="py-3 pr-4">{row.confirmadas}</td>
                    <td className="py-3 pr-4">{row.realizadas}</td>
                    <td className="py-3">{row.ausentes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
