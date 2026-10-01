import { useMutation, useQuery } from '@tanstack/react-query';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo, useState } from 'react';

import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { ApiError, publicApi } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type Person = { id: string; name: string };

type VisitWindow = {
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  promoter: Person;
  professor: Person | null;
};

type WindowsResponse = {
  candidateId: string;
  profileCompleted: boolean;
  days: Array<{ date: string; windows: VisitWindow[] }>;
};

type ScheduleResult = {
  visitId: string;
  status: string;
  period: string;
  professorRequested: boolean;
  promoterName?: string | null;
  professorName?: string | null;
};

type Props = {
  candidateId: string;
  portalToken: string;
  onScheduled: (result: ScheduleResult) => void;
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function WindowPicker({ candidateId, portalToken, onScheduled }: Props) {
  const range = useMemo(() => {
    const start = startOfDay(new Date());
    return { from: start.toISOString(), to: addDays(start, 21).toISOString() };
  }, []);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<VisitWindow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const windowsQuery = useQuery({
    queryKey: queryKeys.windows(candidateId, range.from, range.to),
    queryFn: () =>
      publicApi<WindowsResponse>(
        `/scheduling/windows?candidateId=${candidateId}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&portalToken=${portalToken}`,
      ),
  });

  const days = windowsQuery.data?.days ?? [];
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day.windows])), [days]);
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);
  const dayWindows = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWindow) throw new Error('Selecione um horário');
      return publicApi<ScheduleResult>('/scheduling/visits', {
        method: 'POST',
        body: JSON.stringify({
          candidateId,
          windowStart: new Date(selectedWindow.startsAt).toISOString(),
          windowEnd: new Date(selectedWindow.endsAt).toISOString(),
          portalToken,
        }),
      });
    },
    onSuccess: onScheduled,
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'NO_ELIGIBLE_PROMOTER') {
          setError('Nenhum promotor disponível nesta janela. Escolha outro horário.');
          void windowsQuery.refetch();
          return;
        }
        if (err.code === 'PROFILE_INCOMPLETE') {
          setError('Perfil incompleto. Volte e conclua o questionário.');
          return;
        }
        if (err.code === 'PARTICIPANT_BUSY' || err.code === 'SLOT_UNAVAILABLE') {
          setError('Horário acabou de ficar indisponível. Atualizamos a lista.');
          void windowsQuery.refetch();
          return;
        }
        setError(err.message);
        return;
      }
      setError('Falha ao agendar. Tente novamente.');
    },
  });

  if (windowsQuery.isLoading) return <Spinner label="Carregando calendário…" />;

  if (windowsQuery.isError) {
    const message =
      windowsQuery.error instanceof ApiError
        ? windowsQuery.error.message
        : 'Não foi possível carregar os horários. Verifique se a API está no ar.';
    return (
      <EmptyState
        title="Falha ao buscar horários"
        description={message}
        action={
          <Button variant="secondary" onClick={() => void windowsQuery.refetch()}>
            Tentar de novo
          </Button>
        }
      />
    );
  }

  if (!days.length) {
    return (
      <EmptyState
        title="Sem horários disponíveis"
        description="Não há promotor com disponibilidade nos próximos dias. Peça ao admin para cadastrar um promotor e gerar slots (ou rode npm run seed:users)."
        action={
          <Button variant="secondary" onClick={() => void windowsQuery.refetch()}>
            Atualizar
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Escolha o dia e o horário</h2>
        <p className="mt-1 text-sm text-slate-600">
          Dias com vaga aparecem destacados. Ao escolher um dia, mostramos quem conduz a visita.
        </p>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            type="button"
            onClick={() => setMonth((current) => startOfMonth(addDays(startOfMonth(current), -1)))}
          >
            ‹
          </Button>
          <p className="text-sm font-semibold capitalize text-slate-800">
            {format(month, 'MMMM yyyy', { locale: ptBR })}
          </p>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setMonth((current) => startOfMonth(addDays(endOfMonth(current), 1)))}
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
            const windows = byDate.get(key) ?? [];
            const inMonth = isSameMonth(day, month);
            const active = key === selectedDay;
            const available = windows.length > 0;
            return (
              <button
                key={key}
                type="button"
                disabled={!available}
                onClick={() => {
                  setSelectedDay(key);
                  setSelectedWindow(windows[0] ?? null);
                  setError(null);
                }}
                className={`rounded-xl px-1 py-2 text-sm ${
                  active
                    ? 'bg-brand-600 font-semibold text-white'
                    : available
                      ? 'bg-brand-50 font-medium text-brand-800 hover:bg-brand-100'
                      : 'text-slate-300'
                } ${inMonth ? '' : 'opacity-40'}`}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </Card>

      {selectedDay ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold capitalize text-slate-800">
            {format(parseISO(selectedDay), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {dayWindows.map((window) => {
              const active = selectedWindow?.startsAt === window.startsAt && selectedWindow.promoter.id === window.promoter.id;
              return (
                <button
                  key={`${window.startsAt}-${window.promoter.id}`}
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    active ? 'border-brand-600 bg-brand-50 font-semibold text-brand-900' : 'border-slate-200 bg-white'
                  }`}
                  onClick={() => {
                    setSelectedWindow(window);
                    setError(null);
                  }}
                >
                  {formatTime(window.startsAt)} – {formatTime(window.endsAt)}
                </button>
              );
            })}
          </div>

          {selectedWindow ? (
            <Card className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Equipe deste horário</p>
              <p className="text-sm text-slate-700">
                Promotor: <span className="font-medium">{selectedWindow.promoter.name}</span>
              </p>
              <p className="text-sm text-slate-700">
                Professor:{' '}
                <span className="font-medium">
                  {selectedWindow.professor?.name ?? 'não haverá professor neste horário'}
                </span>
              </p>
            </Card>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Selecione um dia destacado no calendário.</p>
      )}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button
        className="w-full"
        disabled={!selectedWindow || scheduleMutation.isPending}
        onClick={() => {
          setError(null);
          scheduleMutation.mutate();
        }}
      >
        {scheduleMutation.isPending ? 'Agendando…' : 'Confirmar horário'}
      </Button>
    </div>
  );
}
