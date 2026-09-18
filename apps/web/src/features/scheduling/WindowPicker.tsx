import { useMutation, useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo, useState } from 'react';

import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { ApiError, publicApi } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type WindowsResponse = {
  candidateId: string;
  profileCompleted: boolean;
  days: Array<{
    date: string;
    windows: Array<{ startsAt: string; endsAt: string; capacity: number; bookedCount: number }>;
  }>;
};

type ScheduleResult = {
  visitId: string;
  status: string;
  period: string;
  professorRequested: boolean;
};

type Props = {
  candidateId: string;
  portalToken: string;
  onScheduled: (result: ScheduleResult) => void;
};

export function WindowPicker({ candidateId, portalToken, onScheduled }: Props) {
  const from = startOfDay(new Date()).toISOString();
  const to = addDays(new Date(), 21).toISOString();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<{ start: string; end: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const windowsQuery = useQuery({
    queryKey: queryKeys.windows(candidateId, from, to),
    queryFn: () =>
      publicApi<WindowsResponse>(
        `/scheduling/windows?candidateId=${candidateId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&portalToken=${portalToken}`,
      ),
    refetchInterval: 30_000,
  });

  const days = windowsQuery.data?.days ?? [];
  const activeDay = selectedDay ?? days[0]?.date ?? null;
  const dayWindows = useMemo(
    () => days.find((day) => day.date === activeDay)?.windows ?? [],
    [days, activeDay],
  );

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWindow) throw new Error('Selecione um horário');
      return publicApi<ScheduleResult>('/scheduling/visits', {
        method: 'POST',
        body: JSON.stringify({
          candidateId,
          windowStart: selectedWindow.start,
          windowEnd: selectedWindow.end,
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

  if (windowsQuery.isLoading) return <Spinner label="Buscando horários com promotor elegível…" />;

  if (!days.length) {
    return (
      <EmptyState
        title="Sem horários disponíveis"
        description="Não há janelas com promotor elegível nos próximos dias. Tente mais tarde ou fale com a instituição."
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
        <h2 className="text-xl font-bold text-slate-900">Escolha o horário</h2>
        <p className="mt-1 text-sm text-slate-600">
          Só mostramos dias em que existe ao menos um promotor compatível.
          {!windowsQuery.data?.profileCompleted ? ' Conclua o perfil antes de agendar.' : ''}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const active = day.date === activeDay;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => {
                setSelectedDay(day.date);
                setSelectedWindow(null);
              }}
              className={`min-w-[5.5rem] rounded-2xl border px-3 py-3 text-left ${
                active ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'
              }`}
            >
              <p className="text-xs uppercase text-slate-500">
                {format(parseISO(day.date), 'EEE', { locale: ptBR })}
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {format(parseISO(day.date), 'dd MMM', { locale: ptBR })}
              </p>
              <p className="text-xs text-slate-500">{day.windows.length} opções</p>
            </button>
          );
        })}
      </div>

      <Card className="space-y-2">
        {dayWindows.map((window) => {
          const active = selectedWindow?.start === window.startsAt;
          return (
            <button
              key={`${window.startsAt}-${window.endsAt}`}
              type="button"
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm ${
                active ? 'border-brand-600 bg-brand-50' : 'border-slate-200'
              }`}
              onClick={() => setSelectedWindow({ start: window.startsAt, end: window.endsAt })}
            >
              <span className="font-medium text-slate-800">
                {formatTime(window.startsAt)} – {formatTime(window.endsAt)}
              </span>
              <span className="text-xs text-slate-500">
                {window.capacity - window.bookedCount} vaga(s)
              </span>
            </button>
          );
        })}
      </Card>

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
