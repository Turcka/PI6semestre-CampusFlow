import { USER_ROLES, type UserRole } from '@campusflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button, Card, FieldError, Input, Label, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { ApiError, v1Api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
};

type CourseRow = { id: string; name: string; code?: string | null };

type UsersPage = {
  data: UserRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<'single_choice' | 'multi_choice' | 'scale' | 'free_text'>('single_choice');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('CampusFlow123!');
  const [role, setRole] = useState<UserRole>('promotor');
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [userError, setUserError] = useState<string | null>(null);

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
    queryKey: queryKeys.users(),
    queryFn: () => v1Api<UsersPage>('/users?pageSize=50'),
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
          courseIds: role === 'admin' ? undefined : courseIds,
        }),
      }),
    onSuccess: async () => {
      setFullName('');
      setEmail('');
      setPassword('CampusFlow123!');
      setRole('promotor');
      setCourseIds([]);
      setUserError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.users() });
    },
    onError: (err) => {
      setUserError(err instanceof ApiError ? err.message : 'Falha ao criar usuário.');
    },
  });

  function toggleCourse(id: string) {
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

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
            Cadastre admin, promotor ou professor com senha (útil em ambiente local).
          </p>
        </div>

        {usersQuery.isLoading ? (
          <Spinner />
        ) : (
          <ul className="space-y-2 text-sm">
            {(usersQuery.data?.data ?? []).map((user) => (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <div>
                  <p className="font-medium text-slate-900">{user.full_name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs capitalize text-slate-600 ring-1 ring-slate-200">
                  {user.role}
                  {!user.is_active ? ' · inativo' : ''}
                </span>
              </li>
            ))}
            {!(usersQuery.data?.data ?? []).length ? (
              <li className="text-slate-500">Nenhum usuário listado ainda.</li>
            ) : null}
          </ul>
        )}

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
          disabled={!fullName || !email || password.length < 8 || createUser.isPending}
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
