import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui';
import { ApiError, v1Api } from '@/lib/api';

type Props = {
  visitId: string;
  status: string;
  /** Chaves de query a invalidar além de `visits` e `calendar`. */
  onChanged?: () => void;
  compact?: boolean;
};

const PRESENCE_STATUSES = ['confirmada', 'em_atendimento', 'realizada', 'ausente'];

/**
 * Alternância rápida Presente / Ausente para o admin, com "Desfazer" quando já há desfecho.
 * Usa POST /visits/:id/presence (realizada | ausente | volta para confirmada).
 */
export function PresenceToggle({ visitId, status, onChanged, compact = false }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (present: boolean | null) =>
      v1Api(`/visits/${visitId}/presence`, { method: 'POST', body: JSON.stringify({ present }) }),
    onSuccess: async () => {
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['visit', visitId] }),
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      ]);
      onChanged?.();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível registrar a presença.'),
  });

  if (!PRESENCE_STATUSES.includes(status)) return null;

  const decided = status === 'realizada' || status === 'ausente';
  const sizeClass = compact ? 'min-h-9 px-3 text-xs' : '';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Registro de presença">
        {decided ? (
          <>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                status === 'realizada' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {status === 'realizada' ? 'Presente' : 'Ausente'}
            </span>
            <Button
              variant="ghost"
              className={sizeClass}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(null)}
              aria-label="Desfazer registro de presença"
            >
              Desfazer
            </Button>
          </>
        ) : (
          <>
            <Button
              className={`bg-green-600 hover:bg-green-700 focus:ring-green-500 ${sizeClass}`}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Presente
            </Button>
            <Button variant="secondary" className={sizeClass} disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>
              Ausente
            </Button>
          </>
        )}
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
