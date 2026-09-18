import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Button, Card, Input, Label, PageHeader, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { v1Api } from '@/lib/api';

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
  const [area, setArea] = useState('');
  const [topics, setTopics] = useState('');
  const [acceptsVisits, setAcceptsVisits] = useState(true);
  const [isSubstitute, setIsSubstitute] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      v1Api('/professors/me/profile', {
        method: 'PUT',
        body: JSON.stringify({
          area,
          topics: topics
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          acceptsVisits,
          isSubstitute,
        }),
      }),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Meu perfil de professor" description="Quando e como você pode participar das visitas." />
      <Card className="space-y-3">
        <div>
          <Label>Área</Label>
          <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Engenharia de Computação" />
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
        <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Salvar
        </Button>
        {saveMutation.isSuccess ? <p className="text-sm text-emerald-700">Perfil atualizado.</p> : null}
      </Card>
    </div>
  );
}
