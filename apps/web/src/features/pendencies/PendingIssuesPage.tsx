import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge, Button, Card, EmptyState, FieldError, Label, PageHeader, Select, Spinner } from '@/components/ui';
import { PresenceToggle } from '@/features/visits/PresenceToggle';
import { ApiError, v1Api } from '@/lib/api';
import { formatDateTime, parseTstzrange } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

type VisitRow = {
  id: string;
  status: string;
  period: string;
  promoter_id: string | null;
  professor_id: string | null;
  pendingIssues?: string[];
  candidates?: { full_name?: string } | null;
};

type Staff = {
  id: string;
  full_name: string;
  role: string;
  is_active?: boolean;
  is_banned?: boolean;
  avatar_url?: string | null;
  eligible?: boolean | null;
};
type Paginated<T> = { data: T[]; total: number };

const GROUP_LABELS = [
  ['presenca_pendente', 'Presença a registrar'],
  ['sem_promotor', 'Sem promotor'],
  ['aguardando_professor', 'Aguardando professor'],
  ['convite_pendente', 'Convite pendente'],
  ['outros', 'Outras'],
] as const;

type GroupKey = (typeof GROUP_LABELS)[number][0];

function StaffAvatar({ user }: { user: Staff }) {
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200" />;
  }
  const initials = user.full_name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-800">
      {initials}
    </span>
  );
}

export function PendingIssuesPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('visit');
  const highlightRef = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState<Record<string, { promoterId: string; professorId: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const visitsQuery = useQuery({
    queryKey: queryKeys.visits({ pending: '1' }),
    queryFn: () => v1Api<Paginated<VisitRow>>('/visits?pageSize=100'),
    refetchInterval: 15_000,
  });

  const staffQuery = useQuery({
    queryKey: queryKeys.users({ assignable: 'true' }),
    queryFn: () => v1Api<Paginated<Staff>>('/users?pageSize=100&assignable=true'),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, promoterId, professorId }: { id: string; promoterId: string; professorId: string }) =>
      v1Api(`/visits/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          promoterId,
          professorId: professorId || null,
        }),
      }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Não foi possível resolver a pendência.');
    },
  });

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, visitsQuery.data]);

  if (visitsQuery.isLoading || staffQuery.isLoading) return <Spinner />;

  const staff = (staffQuery.data?.data ?? []).filter((user) => user.is_active !== false && !user.is_banned);
  const promoters = staff.filter((user) => user.role === 'promotor' && user.eligible !== false);
  const professors = staff.filter((user) => user.role === 'professor');

  const all = visitsQuery.data?.data ?? [];
  const issuesOf = (v: VisitRow) => v.pendingIssues ?? [];
  const pending = all.filter(
    (visit) => issuesOf(visit).length > 0 || ['aguardando_promotor', 'aguardando_professor', 'agendada'].includes(visit.status),
  );

  const groups: Record<GroupKey, VisitRow[]> = {
    presenca_pendente: pending.filter((v) => issuesOf(v).includes('presenca_pendente')),
    sem_promotor: pending.filter((v) => issuesOf(v).includes('sem_promotor')),
    aguardando_professor: pending.filter((v) => v.status === 'aguardando_professor' && !issuesOf(v).includes('sem_promotor')),
    convite_pendente: pending.filter(
      (v) => issuesOf(v).includes('convite_pendente') && !issuesOf(v).includes('sem_promotor') && v.status !== 'aguardando_professor',
    ),
    outros: pending.filter(
      (v) =>
        !issuesOf(v).includes('presenca_pendente') &&
        !issuesOf(v).includes('sem_promotor') &&
        v.status !== 'aguardando_professor' &&
        !issuesOf(v).includes('convite_pendente'),
    ),
  };

  function selectionFor(visit: VisitRow) {
    return (
      choice[visit.id] ?? {
        promoterId: visit.promoter_id ?? promoters[0]?.id ?? '',
        professorId: visit.professor_id ?? '',
      }
    );
  }

  return (
    <div>
      <PageHeader
        title="Central de pendências"
        description="Registre presenças do dia e escale promotor/professor nas visitas sem equipe."
        backTo="/app"
        actions={
          <Link to="/app/visitas">
            <Button variant="secondary">Ver todas as visitas</Button>
          </Link>
        }
      />

      {error ? <FieldError>{error}</FieldError> : null}

      {!pending.length ? (
        <EmptyState title="Tudo em dia" description="Não há visitas pendentes no momento." />
      ) : (
        <div className="space-y-6">
          {GROUP_LABELS.map(([key, label]) =>
            groups[key].length ? (
              <section key={key} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {label} <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{groups[key].length}</span>
                </h2>
                {groups[key].map((visit) => {
                  const range = parseTstzrange(visit.period);
                  const selected = selectionFor(visit);
                  const isHighlight = visit.id === highlightId;
                  const promoterInfo = promoters.find((p) => p.id === selected.promoterId);
                  return (
                    <Card
                      key={visit.id}
                      ref={isHighlight ? highlightRef : undefined}
                      className={`space-y-4 ${isHighlight ? 'ring-2 ring-brand-400' : ''}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
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
                      </div>

                      {key === 'presenca_pendente' ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                          <p className="text-sm text-slate-700">O horário desta visita já começou. O visitante compareceu?</p>
                          <PresenceToggle visitId={visit.id} status={visit.status} />
                        </div>
                      ) : (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label htmlFor={`promoter-${visit.id}`}>Promotor</Label>
                              <div className="flex items-center gap-2">
                                {promoterInfo ? <StaffAvatar user={promoterInfo} /> : null}
                                <Select
                                  id={`promoter-${visit.id}`}
                                  value={selected.promoterId}
                                  onChange={(event) =>
                                    setChoice((current) => ({
                                      ...current,
                                      [visit.id]: { ...selected, promoterId: event.target.value },
                                    }))
                                  }
                                >
                                  <option value="">Selecione</option>
                                  {promoters.map((promoter) => (
                                    <option key={promoter.id} value={promoter.id}>
                                      {promoter.full_name}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                              {!promoters.length ? (
                                <p className="mt-1 text-xs text-amber-700">Nenhum promotor apto (onboarding, foto e idade em dia).</p>
                              ) : null}
                            </div>
                            <div>
                              <Label htmlFor={`professor-${visit.id}`}>Professor</Label>
                              <Select
                                id={`professor-${visit.id}`}
                                value={selected.professorId}
                                onChange={(event) =>
                                  setChoice((current) => ({
                                    ...current,
                                    [visit.id]: { ...selected, professorId: event.target.value },
                                  }))
                                }
                              >
                                <option value="">Sem professor</option>
                                {professors.map((professor) => (
                                  <option key={professor.id} value={professor.id}>
                                    {professor.full_name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>
                          <Button
                            disabled={!selected.promoterId || resolveMutation.isPending}
                            onClick={() =>
                              resolveMutation.mutate({
                                id: visit.id,
                                promoterId: selected.promoterId,
                                professorId: selected.professorId,
                              })
                            }
                          >
                            {resolveMutation.isPending ? 'Salvando…' : 'Resolver pendência'}
                          </Button>
                        </>
                      )}
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
