import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Button, Card, Input, Label, PageHeader, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { v1Api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function PromoterProfilePage() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [bio, setBio] = useState('');
  const [maxVisits, setMaxVisits] = useState(3);
  const [acceptsAutoMatch, setAcceptsAutoMatch] = useState(true);

  const profileQuery = useQuery({
    queryKey: ['promoter', 'me', me?.profile.id],
    queryFn: () => v1Api<{ promoter_profiles?: { bio?: string; max_visits_per_day?: number; accepts_auto_match?: boolean } | Array<{ bio?: string; max_visits_per_day?: number; accepts_auto_match?: boolean }> }>(`/promoters/${me!.profile.id}`),
    enabled: Boolean(me?.profile.id),
  });

  useEffect(() => {
    const raw = profileQuery.data?.promoter_profiles;
    const profile = Array.isArray(raw) ? raw[0] : raw;
    if (!profile) return;
    setBio(profile.bio ?? '');
    setMaxVisits(profile.max_visits_per_day ?? 3);
    setAcceptsAutoMatch(profile.accepts_auto_match !== false);
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      v1Api('/promoters/me/profile', {
        method: 'PUT',
        body: JSON.stringify({
          bio,
          maxVisitsPerDay: maxVisits,
          acceptsAutoMatch,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['promoter', 'me'] });
    },
  });

  if (profileQuery.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader title="Meu perfil de promotor" description="Dados usados pelo motor de match." />
      <Card className="space-y-3">
        <div>
          <Label>Bio</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div>
          <Label>Máximo de visitas por dia</Label>
          <Input type="number" min={1} max={20} value={maxVisits} onChange={(e) => setMaxVisits(Number(e.target.value))} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={acceptsAutoMatch} onChange={(e) => setAcceptsAutoMatch(e.target.checked)} />
          Aceitar match automático
        </label>
        <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Salvar
        </Button>
      </Card>
    </div>
  );
}

export function ProfessorProfilePage() {
  const { me, refresh } = useAuth();
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [topics, setTopics] = useState('');
  const [acceptsVisits, setAcceptsVisits] = useState(true);
  const [isSubstitute, setIsSubstitute] = useState(false);

  const coursesQuery = useQuery({
    queryKey: queryKeys.courses(),
    queryFn: () => v1Api<Array<{ id: string; name: string }>>('/courses'),
  });

  useEffect(() => {
    setCourseIds(me?.courseIds ?? []);
  }, [me?.courseIds]);

  const courses = coursesQuery.data ?? [];

  function toggleCourse(id: string) {
    setCourseIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const selected = courses.filter((course) => courseIds.includes(course.id));
      return v1Api('/professors/me/profile', {
        method: 'PUT',
        body: JSON.stringify({
          area: selected.map((course) => course.name).join(', ') || null,
          courseIds,
          topics: topics
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          acceptsVisits,
          isSubstitute,
        }),
      });
    },
    onSuccess: () => {
      void refresh();
    },
  });

  if (coursesQuery.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader title="Meu perfil de professor" description="Quando e como você pode participar das visitas." />
      <Card className="space-y-3">
        <div>
          <Label>Área</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {courses.map((course) => {
              const active = courseIds.includes(course.id);
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => toggleCourse(course.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {course.name}
                </button>
              );
            })}
            {!courses.length ? <p className="text-sm text-slate-500">Nenhum curso cadastrado.</p> : null}
          </div>
        </div>
        <div>
          <Label>Temas (separados por vírgula)</Label>
          <Input value={topics} onChange={(e) => setTopics(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={acceptsVisits} onChange={(e) => setAcceptsVisits(e.target.checked)} />
          Aceita visitas
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isSubstitute} onChange={(e) => setIsSubstitute(e.target.checked)} />
          Pode atuar como substituto
        </label>
        <Button disabled={saveMutation.isPending || !courseIds.length} onClick={() => saveMutation.mutate()}>
          Salvar
        </Button>
        {saveMutation.isSuccess ? <p className="text-sm text-emerald-700">Perfil atualizado.</p> : null}
        {saveMutation.isError ? <p className="text-sm text-rose-600">{(saveMutation.error as Error).message}</p> : null}
      </Card>
    </div>
  );
}
