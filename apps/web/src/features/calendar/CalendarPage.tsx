import { useQuery } from '@tanstack/react-query';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo, useState } from 'react';

import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { ApiError, v1Api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  promoterName: string | null;
  professorName: string | null;
  pendingApproval?: boolean;
  visits?: {
    status?: string;
    candidates?: { full_name?: string } | null;
  } | null;
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(format(new Date(), 'yyyy-MM-dd'));

  const range = useMemo(() => {
    const from = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const to = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return { from: from.toISOString(), to: to.toISOString() };
  }, [month]);

  const eventsQuery = useQuery({
    queryKey: queryKeys.calendarEvents(range.from, range.to),
    queryFn: () =>
      v1Api<CalendarEvent[]>(
        `/calendar/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
  });

  const events = eventsQuery.data ?? [];
  const byDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = format(parseISO(event.starts_at), 'yyyy-MM-dd');
      const list = grouped.get(key) ?? [];
      list.push(event);
      grouped.set(key, list);
    }
    return grouped;
  }, [events]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const dayEvents = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  if (eventsQuery.isLoading) return <Spinner label="Carregando calendário…" />;

  if (eventsQuery.isError) {
    const message = eventsQuery.error instanceof ApiError ? eventsQuery.error.message : 'Não foi possível carregar o calendário.';
    return (
      <div>
        <PageHeader title="Calendário operacional" description="Visitas do mês, com visitante, promotor e professor." />
        <EmptyState title="Falha ao carregar" description={message} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Calendário operacional" description="Visitas do mês, com visitante, promotor e professor." />

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" type="button" onClick={() => setMonth((current) => startOfMonth(new Date(current.getFullYear(), current.getMonth() - 1, 1)))}>
            ‹
          </Button>
          <p className="text-sm font-semibold capitalize text-slate-800">{format(month, 'MMMM yyyy', { locale: ptBR })}</p>
          <Button variant="ghost" type="button" onClick={() => setMonth((current) => startOfMonth(new Date(current.getFullYear(), current.getMonth() + 1, 1)))}>
            ›
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
          {WEEKDAYS.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const count = byDate.get(key)?.length ?? 0;
            const active = key === selectedDay;
            const inMonth = isSameMonth(day, month);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(key)}
                className={`rounded-xl px-1 py-2 text-sm ${
                  active
                    ? 'bg-brand-600 font-semibold text-white'
                    : count
                      ? 'bg-brand-50 font-medium text-brand-800'
                      : 'text-slate-400'
                } ${inMonth ? '' : 'opacity-40'}`}
              >
                <span className="block">{format(day, 'd')}</span>
                {count ? <span className={`block text-[10px] ${active ? 'text-white' : 'text-brand-700'}`}>{count}</span> : null}
              </button>
            );
          })}
        </div>
      </Card>

      {selectedDay ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold capitalize text-slate-800">
            {format(parseISO(selectedDay), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </h2>
          {!dayEvents.length ? (
            <EmptyState title="Nenhuma visita neste dia" description="Selecione um dia destacado para ver os tours." />
          ) : (
            dayEvents.map((event) => (
              <Card key={event.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{event.visits?.candidates?.full_name ?? event.title}</p>
                  <Badge status={event.visits?.status ?? 'agendada'} />
                </div>
                <p className="text-sm text-slate-600">
                  {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
                </p>
                <p className="text-sm text-slate-700">
                  Promotor: <span className="font-medium">{event.promoterName ?? 'a definir'}</span>
                </p>
                <p className="text-sm text-slate-700">
                  Professor: <span className="font-medium">{event.professorName ?? 'não escalado'}</span>
                </p>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
