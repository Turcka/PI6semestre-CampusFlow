import { useQuery } from '@tanstack/react-query';
import { addDays, startOfDay } from 'date-fns';

import { Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { v1Api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  promoter_id: string | null;
  professor_id: string | null;
  pendingApproval?: boolean;
  visits?: {
    status?: string;
    candidates?: { full_name?: string } | null;
  } | null;
};

export function CalendarPage() {
  const from = startOfDay(new Date()).toISOString();
  const to = addDays(new Date(), 14).toISOString();

  const eventsQuery = useQuery({
    queryKey: queryKeys.calendarEvents(from, to),
    queryFn: () =>
      v1Api<CalendarEvent[]>(
        `/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });

  if (eventsQuery.isLoading) return <Spinner />;
  const events = eventsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="Calendário operacional" description="Próximos 14 dias." />
      {!events.length ? (
        <EmptyState title="Agenda vazia" description="Nenhum evento no período." />
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">
                  {event.visits?.candidates?.full_name ?? event.title}
                </p>
                <p className="text-sm text-slate-600">
                  {formatDateTime(event.starts_at)} → {formatDateTime(event.ends_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {event.pendingApproval ? <Badge status="aguardando_promotor">Pendente</Badge> : null}
                <Badge status={event.visits?.status ?? 'agendada'} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
