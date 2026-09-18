import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Textarea } from '@/components/ui';
import { v1Api } from '@/lib/api';
import { formatDateTime, parseTstzrange } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type Invitation = {
  id: string;
  visit_id: string;
  role: string;
  status: string;
  expires_at: string;
  visits?: {
    status?: string;
    focus?: string | null;
    period?: string;
    candidates?: {
      firstName?: string;
      preferred_focus?: string | null;
      profile_summary?: string | null;
    } | null;
  } | null;
};

export function InvitationsPage({ title = 'Convocações' }: { title?: string }) {
  const queryClient = useQueryClient();
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const listQuery = useQuery({
    queryKey: queryKeys.invitations('pending'),
    queryFn: () => v1Api<Invitation[]>('/invitations/me?status=pending'),
    refetchInterval: 15_000,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, accept, declineReason }: { id: string; accept: boolean; declineReason?: string }) => {
      const path = accept ? `/invitations/${id}/accept` : `/invitations/${id}/decline`;
      return v1Api(path, {
        method: 'POST',
        body: JSON.stringify(accept ? {} : { reason: declineReason }),
      });
    },
    onSuccess: async () => {
      setDeclineId(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.invitations('pending') });
    },
  });

  if (listQuery.isLoading) return <Spinner />;

  const items = listQuery.data ?? [];

  return (
    <div>
      <PageHeader title={title} description="Aceite ou recuse as solicitações pendentes." />
      {!items.length ? (
        <EmptyState title="Nenhuma pendência" description="Quando houver uma nova convocação, ela aparecerá aqui." />
      ) : (
        <div className="space-y-4">
          {items.map((invitation) => {
            const range = parseTstzrange(invitation.visits?.period);
            const candidate = invitation.visits?.candidates;
            return (
              <Card key={invitation.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{candidate?.firstName ?? 'Candidato'}</p>
                    <p className="text-sm text-slate-600">
                      {range ? formatDateTime(range.start) : 'Horário a confirmar'}
                      {invitation.visits?.focus ? ` · foco ${invitation.visits.focus}` : ''}
                    </p>
                  </div>
                  <Badge status={invitation.visits?.status ?? 'aguardando_promotor'} />
                </div>
                {candidate?.profile_summary ? (
                  <p className="text-sm text-slate-700">{candidate.profile_summary}</p>
                ) : null}
                <p className="text-xs text-slate-500">Expira em {formatDateTime(invitation.expires_at)}</p>

                {declineId === invitation.id ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Motivo da recusa"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        disabled={respondMutation.isPending}
                        onClick={() =>
                          respondMutation.mutate({ id: invitation.id, accept: false, declineReason: reason })
                        }
                      >
                        Confirmar recusa
                      </Button>
                      <Button variant="ghost" onClick={() => setDeclineId(null)}>
                        Voltar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      disabled={respondMutation.isPending}
                      onClick={() => respondMutation.mutate({ id: invitation.id, accept: true })}
                    >
                      Aceitar
                    </Button>
                    <Button variant="secondary" onClick={() => setDeclineId(invitation.id)}>
                      Recusar
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
