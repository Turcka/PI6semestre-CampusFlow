import { USER_ROLES, isAdult, type UserRole } from '@campusflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button, Card, Drawer, FieldError, Input, Label, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { ONBOARDING_LABELS, useAuth } from '@/features/auth/AuthProvider';
import { ApiError, v1Api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_banned?: boolean;
  banned_at?: string | null;
  ban_reason?: string | null;
  avatar_url?: string | null;
  birth_date?: string | null;
  eligible?: boolean | null;
  eligibilityMissing?: string[];
};

type ModerationAction = { kind: 'ban' | 'remove'; user: UserRow };

function UserAvatar({ user }: { user: UserRow }) {
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" />;
  }
  const initials = user.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
      {initials || '?'}
    </span>
  );
}

/** Drawer de confirmação: banir pede motivo; expulsar exige digitar o e-mail. */
function ModerationDrawer({
  action,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  action: ModerationAction | null;
  onClose: () => void;
  onConfirm: (payload: { reason?: string }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const isBan = action?.kind === 'ban';
  const canConfirm = isBan ? reason.trim().length >= 3 : confirmEmail.trim().toLowerCase() === action?.user.email.toLowerCase();

  return (
    <Drawer
      open={Boolean(action)}
      onClose={() => {
        setReason('');
        setConfirmEmail('');
        onClose();
      }}
      title={isBan ? 'Banir usuário' : 'Expulsar usuário'}
      description={action ? `${action.user.full_name} · ${action.user.email}` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={!canConfirm || pending} onClick={() => onConfirm({ reason: reason.trim() || undefined })}>
            {pending ? 'Processando…' : isBan ? 'Confirmar banimento' : 'Expulsar definitivamente'}
          </Button>
        </div>
      }
    >
      {isBan ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            O usuário perde o acesso imediatamente, sai do match e das escalações. As visitas futuras dele voltam para a
            central de pendências; o histórico é preservado. Pode ser revertido com &quot;Desbanir&quot;.
          </p>
          <div>
            <Label htmlFor="ban-reason">Motivo (registrado na auditoria)</Label>
            <Textarea id="ban-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: faltas recorrentes sem aviso" data-autofocus />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            A conta é removida em definitivo. Visitas passadas continuam no histórico (sem o vínculo), visitas futuras
            voltam para a central de pendências. <strong>Esta ação não pode ser desfeita.</strong>
          </p>
          <div>
            <Label htmlFor="remove-confirm">Digite o e-mail do usuário para confirmar</Label>
            <Input id="remove-confirm" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={action?.user.email} data-autofocus />
          </div>
        </div>
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </Drawer>
  );
}

type CourseRow = { id: string; name: string; code?: string | null };

type UsersPage = {
  data: UserRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<'single_choice' | 'multi_choice' | 'scale' | 'free_text'>('single_choice');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('CampusFlow123!');
  const [role, setRole] = useState<UserRole>('promotor');
  const [birthDate, setBirthDate] = useState('');
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [userError, setUserError] = useState<string | null>(null);

  const [moderation, setModeration] = useState<ModerationAction | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const banMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      v1Api(`/users/${id}/ban`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: async () => {
      setModeration(null);
      setModerationError(null);
      await invalidateUsers();
    },
    onError: (err) => setModerationError(err instanceof ApiError ? err.message : 'Falha ao banir usuário.'),
  });

  const unbanMutation = useMutation({
    mutationFn: (id: string) => v1Api(`/users/${id}/unban`, { method: 'POST' }),
    onSuccess: invalidateUsers,
    onError: (err) => setUserError(err instanceof ApiError ? err.message : 'Falha ao desbanir usuário.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => v1Api(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setModeration(null);
      setModerationError(null);
      await invalidateUsers();
    },
    onError: (err) => setModerationError(err instanceof ApiError ? err.message : 'Falha ao remover usuário.'),
  });

  const questionsQuery = useQuery({
    queryKey: queryKeys.chatbotQuestions(),
    queryFn: () =>
      v1Api<Array<{ id: string; key: string; prompt: string; kind: string; audience: string }>>(
        '/chatbot/questions?includeInactive=false',
      ),
  });

  const weightsQuery = useQuery({
    queryKey: queryKeys.matchWeights(),
    queryFn: () => v1Api<Array<{ criterion: string; weight: number; kind: string }>>('/match/weights'),
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.users({ includeBanned: 'true' }),
    queryFn: () => v1Api<UsersPage>('/users?pageSize=100&includeBanned=true'),
  });

  const coursesQuery = useQuery({
    queryKey: queryKeys.courses(),
    queryFn: () => v1Api<CourseRow[]>('/courses'),
  });

  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);

  const createQuestion = useMutation({
    mutationFn: () =>
      v1Api('/chatbot/questions', {
        method: 'POST',
        body: JSON.stringify({
          key,
          prompt,
          kind,
          audience: 'candidato',
          options:
            kind === 'scale' || kind === 'free_text'
              ? []
              : [
                  { value: 'opcao_a', label: 'Opção A' },
                  { value: 'opcao_b', label: 'Opção B' },
                ],
          orderIndex: (questionsQuery.data?.length ?? 0) + 1,
          isRequired: true,
          isActive: true,
        }),
      }),
    onSuccess: async () => {
      setKey('');
      setPrompt('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.chatbotQuestions() });
    },
  });

  const createUser = useMutation({
    mutationFn: () =>
      v1Api('/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          birthDate: birthDate || undefined,
          courseIds: role === 'admin' ? undefined : courseIds,
        }),
      }),
    onSuccess: async () => {
      setFullName('');
      setEmail('');
      setPassword('CampusFlow123!');
      setRole('promotor');
      setBirthDate('');
      setCourseIds([]);
      setUserError(null);
      await invalidateUsers();
    },
    onError: (err) => {
      setUserError(err instanceof ApiError ? err.message : 'Falha ao criar usuário.');
    },
  });

  function toggleCourse(id: string) {
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  const promoterUnderage = role === 'promotor' && birthDate ? !isAdult(birthDate) : false;
  const promoterMissingBirth = role === 'promotor' && !birthDate;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Usuários da instituição, perguntas do chatbot e pesos do match."
      />

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Usuários</h2>
          <p className="text-sm text-slate-600">
            Banir suspende o acesso mantendo o histórico; expulsar remove a conta. Promotores precisam estar &quot;aptos&quot; para
            receber visitas.
          </p>
        </div>

        {usersQuery.isLoading ? (
          <Spinner />
        ) : (
          <ul className="space-y-2 text-sm">
            {(usersQuery.data?.data ?? []).map((user) => {
              const isSelf = user.id === me?.profile.id;
              return (
                <li
                  key={user.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                    user.is_banned ? 'bg-rose-50 ring-1 ring-rose-100' : 'bg-slate-50'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar user={user} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {user.full_name}
                        {isSelf ? <span className="ml-1 text-xs text-slate-500">(você)</span> : null}
                      </p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                      {user.is_banned && user.ban_reason ? <p className="text-xs text-rose-700">Banido: {user.ban_reason}</p> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs capitalize text-slate-600 ring-1 ring-slate-200">
                      {user.role}
                      {!user.is_active && !user.is_banned ? ' · inativo' : ''}
                    </span>
                    {user.is_banned ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">Banido</span>
                    ) : null}
                    {user.role === 'promotor' && !user.is_banned ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          user.eligible ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                        }`}
                        title={user.eligible ? 'Pronto para receber visitas' : (user.eligibilityMissing ?? []).map((k) => ONBOARDING_LABELS[k] ?? k).join('; ')}
                      >
                        {user.eligible ? 'Apto' : 'Pendente'}
                      </span>
                    ) : null}
                    {!isSelf ? (
                      <>
                        {user.is_banned ? (
                          <Button variant="secondary" className="min-h-9 px-3 text-xs" disabled={unbanMutation.isPending} onClick={() => unbanMutation.mutate(user.id)}>
                            Desbanir
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="min-h-9 px-3 text-xs"
                            onClick={() => {
                              setModerationError(null);
                              setModeration({ kind: 'ban', user });
                            }}
                          >
                            Banir
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          className="min-h-9 px-3 text-xs"
                          onClick={() => {
                            setModerationError(null);
                            setModeration({ kind: 'remove', user });
                          }}
                        >
                          Expulsar
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {!(usersQuery.data?.data ?? []).length ? (
              <li className="text-slate-500">Nenhum usuário listado ainda.</li>
            ) : null}
          </ul>
        )}

        <ModerationDrawer
          action={moderation}
          onClose={() => setModeration(null)}
          pending={banMutation.isPending || removeMutation.isPending}
          error={moderationError}
          onConfirm={({ reason }) => {
            if (!moderation) return;
            if (moderation.kind === 'ban') banMutation.mutate({ id: moderation.user.id, reason: reason ?? '' });
            else removeMutation.mutate(moderation.user.id);
          }}
        />

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Novo usuário</h3>
          <p className="text-xs text-slate-500">Cadastre admin, promotor ou professor com senha (útil em ambiente local).</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@instituicao.edu" />
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label>Papel</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Data de nascimento {role === 'promotor' ? '(obrigatória, 18+)' : '(opcional)'}</Label>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            {promoterUnderage ? <FieldError>Promotores precisam ter 18 anos ou mais.</FieldError> : null}
          </div>
        </div>

        {role !== 'admin' ? (
          <div>
            <Label>Cursos vinculados</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {courses.map((course) => {
                const active = courseIds.includes(course.id);
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => toggleCourse(course.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {course.name}
                  </button>
                );
              })}
              {!courses.length ? <p className="text-sm text-slate-500">Nenhum curso encontrado.</p> : null}
            </div>
          </div>
        ) : null}

        <FieldError>{userError}</FieldError>
        <Button
          disabled={!fullName || !email || password.length < 8 || createUser.isPending || promoterUnderage || promoterMissingBirth}
          onClick={() => {
            setUserError(null);
            createUser.mutate();
          }}
        >
          {createUser.isPending ? 'Criando…' : 'Criar usuário'}
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Perguntas do chatbot</h2>
        {questionsQuery.isLoading ? (
          <Spinner />
        ) : (
          <ul className="space-y-2 text-sm">
            {(questionsQuery.data ?? []).map((question) => (
              <li key={question.id} className="rounded-xl bg-slate-50 px-3 py-2">
                <span className="font-medium">{question.key}</span> · {question.prompt}
                <span className="ml-2 text-xs text-slate-500">{question.kind}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Chave</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ex.: foco_preferido" />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="single_choice">Escolha única</option>
              <option value="multi_choice">Múltipla escolha</option>
              <option value="scale">Escala 1–5</option>
              <option value="free_text">Texto livre</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Pergunta</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>
        </div>
        <Button disabled={!key || !prompt || createQuestion.isPending} onClick={() => createQuestion.mutate()}>
          Adicionar pergunta
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Pesos do match</h2>
        {weightsQuery.isLoading ? (
          <Spinner />
        ) : (
          <ul className="space-y-2 text-sm">
            {(weightsQuery.data ?? []).map((weight) => (
              <li key={weight.criterion} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>{weight.criterion}</span>
                <span>
                  {weight.weight} · {weight.kind}
                </span>
              </li>
            ))}
            {!(weightsQuery.data ?? []).length ? (
              <li className="text-slate-500">Nenhum peso cadastrado (o banco pode usar defaults no RPC).</li>
            ) : null}
          </ul>
        )}
      </Card>
    </div>
  );
}
