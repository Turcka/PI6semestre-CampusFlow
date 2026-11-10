import { isAdult } from '@campusflow/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Button, Card, FieldError, Input, Label } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiError, v1Api } from '@/lib/api';

import { AvatarUploader } from './AvatarUploader';

type Props = {
  title?: string;
  description?: string;
  /** Exibido quando o papel exige maioridade (promotor). */
  requireAdult?: boolean;
  onSaved?: () => void;
};

/** Foto, nome, telefone e data de nascimento do próprio usuário (PATCH /auth/me). */
export function PersonalDataCard({ title = 'Dados pessoais', description, requireAdult = false, onSaved }: Props) {
  const { me, refresh } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setFullName(me.profile.full_name ?? '');
    setPhone(me.profile.phone ?? '');
    setBirthDate(me.profile.birth_date ?? '');
  }, [me]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => v1Api('/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: async () => {
      setError(null);
      await refresh();
      onSaved?.();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.'),
  });

  if (!me) return null;

  const underage = requireAdult && birthDate ? !isAdult(birthDate) : false;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </div>

      <AvatarUploader
        userId={me.profile.id}
        currentUrl={me.profile.avatar_url}
        name={me.profile.full_name}
        onUploaded={(url) => saveMutation.mutateAsync({ avatarUrl: url }).then(() => undefined)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pd-name">Nome completo</Label>
          <Input id="pd-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pd-phone">Telefone</Label>
          <Input id="pd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" />
        </div>
        <div>
          <Label htmlFor="pd-birth">Data de nascimento {requireAdult ? '(obrigatória, 18+)' : ''}</Label>
          <Input id="pd-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          {underage ? <FieldError>Promotores precisam ter 18 anos ou mais.</FieldError> : null}
        </div>
      </div>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button
        disabled={saveMutation.isPending || fullName.trim().length < 3 || underage || (requireAdult && !birthDate)}
        onClick={() =>
          saveMutation.mutate({
            fullName: fullName.trim(),
            phone: phone.trim() || null,
            birthDate: birthDate || null,
          })
        }
      >
        {saveMutation.isPending ? 'Salvando…' : 'Salvar dados'}
      </Button>
    </Card>
  );
}
