import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card, Drawer, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { PresenceToggle } from '@/features/visits/PresenceToggle';
import { ApiError, v1Api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type CalendarEvent = {
  id: string;
  visit_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  promoterName: string | null;
  professorName: string | null;
  pendingApproval?: boolean;
  visits?: {
    id?: string;
    status?: string;
    candidates?: { full_name?: string } | null;
  } | null;
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
    for (const list of grouped.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return grouped;
  }, [events]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const dayEvents = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  function shiftSelectedDay(delta: number) {
    if (!selectedDay) return;
    const next = addDays(parseISO(selectedDay), delta);
    const key = format(next, 'yyyy-MM-dd');
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next));
    setSelectedDay(key);
  }

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
      <PageHeader
        title="Calendário operacional"
        description="Clique em um dia para ver as visitas, a equipe escalada e registrar presença."
      />

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            type="button"
            aria-label="Mês anterior"
            onClick={() => setMonth((current) => startOfMonth(new Date(current.getFullYear(), current.getMonth() - 1, 1)))}
          >
            ‹
          </Button>
          <p className="text-sm font-semibold capitalize text-slate-800">{format(month, 'MMMM yyyy', { locale: ptBR })}</p>
          <Button
            variant="ghost"
            type="button"
            aria-label="Próximo mês"
            onClick={() => setMonth((current) => startOfMonth(new Date(current.getFullYear(), current.getMonth() + 1, 1)))}
          >
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
            const inMonth = isSameMonth(day, month);
            const today = isToday(day);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(key)}
                aria-label={`${format(day, "dd 'de' MMMM", { locale: ptBR })}, ${count} visita${count === 1 ? '' : 's'}`}
                className={`relative rounded-xl px-1 py-2 text-sm transition hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                  count ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-500'
                } ${inMonth ? '' : 'opacity-40'} ${today ? 'ring-1 ring-brand-400' : ''}`}
              >
                <span className="block">{format(day, 'd')}</span>
                {count ? <span className="block text-[10px] text-brand-700">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <Drawer
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? format(parseISO(selectedDay), "EEEE, dd 'de' MMMM", { locale: ptBR }) : ''}
        description={`${dayEvents.length} visita${dayEvents.length === 1 ? '' : 's'} neste dia`}
        footer={
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => shiftSelectedDay(-1)} aria-label="Dia anterior">
              ‹ Dia anterior
            </Button>
            <Button variant="ghost" onClick={() => shiftSelectedDay(1)} aria-label="Próximo dia">
              Próximo dia ›
            </Button>
          </div>
        }
      >
        {!dayEvents.length ? (
          <EmptyState title="Nenhuma visita neste dia" description="Use as setas abaixo para navegar entre os dias." />
        ) : (
          <div className="space-y-3">
            {dayEvents.map((event) => {
              const visitId = event.visit_id ?? event.visits?.id ?? null;
              const status = event.visits?.status ?? 'agendada';
              return (
                <Card key={event.id} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
                      </p>
                      <p className="text-sm text-slate-700">{event.visits?.candidates?.full_name ?? event.title}</p>
                    </div>
                    <Badge status={status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Promotor</dt>
                      <dd className="font-medium text-slate-800">{event.promoterName ?? 'a definir'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Professor</dt>
                      <dd className="font-medium text-slate-800">{event.professorName ?? 'não escalado'}</dd>
                    </div>
                  </dl>
                  {visitId ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <PresenceToggle visitId={visitId} status={status} compact />
                      <div className="flex gap-2">
                        {event.pendingApproval || !event.promoterName ? (
                          <Link to={`/app/pendencias?visit=${visitId}`}>
                            <Button variant="secondary" className="min-h-9 px-3 text-xs">
                              Resolver
                            </Button>
                          </Link>
                        ) : null}
                        <Link to={`/app/visitas/${visitId}`}>
                          <Button variant="secondary" className="min-h-9 px-3 text-xs">
                            Abrir visita
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </Drawer>
    </div>
  );
}
