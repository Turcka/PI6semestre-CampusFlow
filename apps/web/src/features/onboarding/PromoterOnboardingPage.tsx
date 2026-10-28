import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button, Card, PageHeader, Spinner, Stepper } from '@/components/ui';
import { ONBOARDING_LABELS, homeForRole, useAuth } from '@/features/auth/AuthProvider';
import { ChatbotConversation } from '@/features/chatbot/ChatbotConversation';
import { PersonalDataCard } from '@/features/profiles/PersonalDataCard';
import { ApiError, v1Api } from '@/lib/api';

type StartResponse = { sessionId: string; resumed: boolean };
type ReviewResponse = {
  answers: Array<{
    id: string;
    value: { value?: string | number; values?: string[] };
    chatbot_questions?: { prompt?: string; options?: Array<{ value: string | number; label?: string }> } | null;
  }>;
};

const STEPS = ['Dados pessoais', 'Questionário', 'Revisão', 'Concluído'];

function answerLabel(answer: ReviewResponse['answers'][number]) {
  const options = answer.chatbot_questions?.options ?? [];
  const labelFor = (v: string | number) => options.find((o) => String(o.value) === String(v))?.label ?? String(v);
  if (answer.value.values) return answer.value.values.map(labelFor).join(', ');
  if (answer.value.value !== undefined) return labelFor(answer.value.value);
  return '—';
}

/**
 * Onboarding obrigatório do promotor: dados pessoais (foto + nascimento) → questionário
 * comportamental → revisão → conclusão. Enquanto não concluir, o guard bloqueia o restante do app.
 */
export function PromoterOnboardingPage() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const redo = searchParams.get('refazer') === '1';

  const onboarding = me?.onboarding;
  const personalDone = Boolean(onboarding) && !['birth_date', 'underage', 'avatar'].some((k) => onboarding!.missing.includes(k));
  const testDone =
    Boolean(onboarding) && !['onboarding', 'behavioral_test', 'behavioral_test_expired'].some((k) => onboarding!.missing.includes(k));

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // posiciona o passo inicial conforme o que já está pronto
  useEffect(() => {
    if (!onboarding) return;
    if (onboarding.completed && !redo) setStep(3);
    else if (personalDone) setStep((s) => (s === 0 ? 1 : s));
  }, [onboarding, personalDone, redo]);

  const startMutation = useMutation({
    mutationFn: () => v1Api<StartResponse>('/promoters/me/onboarding/session', { method: 'POST' }),
    onSuccess: (data) => {
      setError(null);
      setSessionId(data.sessionId);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível iniciar o questionário.'),
  });

  useEffect(() => {
    if (step === 1 && !sessionId && !startMutation.isPending && !startMutation.isError) startMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId]);

  const reviewQuery = useQuery({
    queryKey: ['promoter-onboarding', 'review', sessionId],
    queryFn: () => v1Api<ReviewResponse>(`/promoters/me/onboarding/session/${sessionId}/review`),
    enabled: step === 2 && Boolean(sessionId),
  });

  const completeMutation = useMutation({
    mutationFn: () => v1Api(`/promoters/me/onboarding/session/${sessionId}/complete`, { method: 'POST' }),
    onSuccess: async () => {
      setError(null);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['promoter', 'me'] });
      setStep(3);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o onboarding.'),
  });

  if (!me) return <Spinner />;
  if (me.profile.role !== 'promotor') {
    navigate(homeForRole(me.profile.role), { replace: true });
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Onboarding do promotor"
        description="Antes de receber visitas precisamos da sua foto, data de nascimento e do questionário comportamental (válido por 6 meses)."
      />

      <Stepper steps={STEPS} current={step} />

      {onboarding && !onboarding.completed ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-900">Pendências para ficar apto:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
            {onboarding.missing.map((key) => (
              <li key={key}>{ONBOARDING_LABELS[key] ?? key}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {step === 0 ? (
        <div className="space-y-3">
          <PersonalDataCard
            title="Passo 1 — Foto e dados pessoais"
            description="Sua foto aparece para o visitante no agendamento. Promotores precisam ter 18 anos ou mais."
            requireAdult
          />
          <div className="flex justify-end">
            <Button disabled={!personalDone} onClick={() => setStep(1)}>
              Continuar para o questionário
            </Button>
          </div>
          {!personalDone ? <p className="text-right text-xs text-slate-500">Envie a foto e informe a data de nascimento para continuar.</p> : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <Card>
            <h2 className="text-base font-semibold text-slate-900">Passo 2 — Questionário comportamental</h2>
            <p className="text-sm text-slate-600">
              Suas respostas alimentam o perfil usado pelo match com os visitantes. Leva cerca de 3 minutos.
            </p>
          </Card>
          {sessionId ? (
            <ChatbotConversation
              sessionId={sessionId}
              endpoint={{ basePath: `/promoters/me/onboarding/session/${sessionId}`, mode: 'authenticated' }}
              finishLabel="Revisar respostas"
              onFinished={() => setStep(2)}
            />
          ) : startMutation.isError ? (
            <Button variant="secondary" onClick={() => startMutation.mutate()}>
              Tentar novamente
            </Button>
          ) : (
            <Spinner label="Preparando questionário…" />
          )}
          <Button variant="ghost" onClick={() => setStep(0)}>
            ‹ Voltar aos dados pessoais
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <Card className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Passo 3 — Revise suas respostas</h2>
            {reviewQuery.isLoading ? <Spinner /> : null}
            {reviewQuery.data ? (
              <dl className="divide-y divide-slate-100">
                {reviewQuery.data.answers.map((answer) => (
                  <div key={answer.id} className="py-2">
                    <dt className="text-xs uppercase tracking-wide text-slate-500">{answer.chatbot_questions?.prompt}</dt>
                    <dd className="text-sm text-slate-800">{answerLabel(answer)}</dd>
                  </div>
                ))}
                {!reviewQuery.data.answers.length ? <p className="text-sm text-slate-500">Nenhuma resposta registrada.</p> : null}
              </dl>
            ) : null}
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ‹ Voltar
            </Button>
            <Button disabled={completeMutation.isPending || !reviewQuery.data?.answers.length} onClick={() => completeMutation.mutate()}>
              {completeMutation.isPending ? 'Concluindo…' : 'Concluir onboarding'}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <Card className="space-y-3 text-center">
          <p className="text-4xl" aria-hidden="true">
            🎉
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            {onboarding?.completed ? 'Você está apto a receber visitas!' : 'Onboarding registrado'}
          </h2>
          <p className="text-sm text-slate-600">
            {onboarding?.completed
              ? 'A partir de agora você entra no match automático e pode ser escalado pela administração.'
              : 'Ainda há pendências listadas acima. Resolva-as para ficar apto.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/app/convocacoes">
              <Button disabled={!onboarding?.completed}>Ir para convocações</Button>
            </Link>
            <Link to="/app/meu-perfil">
              <Button variant="secondary">Ver meu perfil</Button>
            </Link>
            {testDone ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSessionId(null);
                  startMutation.reset();
                  setStep(1);
                }}
              >
                Refazer questionário
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
