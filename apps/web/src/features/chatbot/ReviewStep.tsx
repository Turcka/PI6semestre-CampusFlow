import { MATRICULATION_PRIORITY_LABELS, type AiInsights } from '@campusflow/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, Spinner } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type AnswerOption = { value: string | number; label?: string };

type ReviewPayload = {
  session: { id: string; status: string };
  answers: Array<{
    question_id: string;
    value: unknown;
    chatbot_questions?: { prompt?: string; key?: string; options?: AnswerOption[] | null } | null;
  }>;
  preview: {
    interests: Array<{ slug: string; score: number }>;
    focus: string | null;
    summary: string;
  };
};

export type CompletePayload = {
  candidateId: string;
  summary: string | null;
  focus: string | null;
  interests: Array<{ score: number; interest_categories?: { name?: string; slug?: string } | null }>;
  /** Insights da conversa com o secretário virtual; `null` no questionário por botões ou se a síntese falhar. */
  insights?: AiInsights | null;
};

type Props = {
  sessionId: string;
  /** Token do portal do candidato, enviado em `X-Candidate-Token`. */
  portalToken?: string;
  onCompleted: (result: CompletePayload) => void;
};

const PRIORITIES_KEY = 'prioridades_matricula';

function selectedValues(value: unknown): Array<string | number> {
  if (typeof value === 'string' || typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.values)) return selectedValues(record.values);
    if (record.value != null) return selectedValues(record.value);
  }
  return [];
}

function optionLabel(value: string | number, options?: AnswerOption[] | null) {
  return options?.find((option) => String(option.value) === String(value))?.label ?? String(value);
}

function formatAnswer(value: unknown, options?: AnswerOption[] | null) {
  const selected = selectedValues(value);
  if (!selected.length) return '—';
  return selected.map((item) => optionLabel(item, options)).join(', ');
}

function priorityLabel(value: string | number, options?: AnswerOption[] | null) {
  const known = (MATRICULATION_PRIORITY_LABELS as Record<string, string>)[String(value)];
  return options?.find((option) => String(option.value) === String(value))?.label ?? known ?? String(value);
}

export function ReviewStep({ sessionId, portalToken, onCompleted }: Props) {
  const [completed, setCompleted] = useState<CompletePayload | null>(null);

  const reviewQuery = useQuery({
    queryKey: queryKeys.chatbotReview(sessionId),
    queryFn: () => publicApi<ReviewPayload>(`/chatbot/sessions/${sessionId}/review`, { candidateToken: portalToken }),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      publicApi<CompletePayload>(`/chatbot/sessions/${sessionId}/complete`, { method: 'POST', candidateToken: portalToken }),
    onSuccess: (result) => {
      // Com insights da conversa, mostra o resumo e as dúvidas antes de seguir para o horário.
      if (result.insights) setCompleted(result);
      else onCompleted(result);
    },
  });

  if (completed) {
    const doubts = completed.insights?.doubts ?? [];
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Perfil pronto</h2>
          <p className="mt-1 text-sm text-slate-600">Foi isso que entendemos da nossa conversa.</p>
        </div>

        {completed.summary ? (
          <Card>
            <p className="text-sm leading-relaxed text-slate-800">{completed.summary}</p>
          </Card>
        ) : null}

        {doubts.length ? (
          <Card className="space-y-2">
            <h3 className="font-semibold text-slate-900">Vamos esclarecer na visita</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {doubts.map((doubt) => (
                <li key={doubt}>{doubt}</li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Button className="w-full" onClick={() => onCompleted(completed)}>
          Escolher horário
        </Button>
      </div>
    );
  }

  if (reviewQuery.isLoading) return <Spinner label="Montando revisão…" />;
  if (!reviewQuery.data) return <p className="text-rose-600">Não foi possível carregar a revisão.</p>;

  const { answers, preview } = reviewQuery.data;
  const prioritiesAnswer = answers.find((answer) => answer.chatbot_questions?.key === PRIORITIES_KEY);
  const priorities = prioritiesAnswer ? selectedValues(prioritiesAnswer.value) : [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Revise suas respostas</h2>
        <p className="mt-1 text-sm text-slate-600">Confira antes de gerar o perfil e escolher o horário.</p>
      </div>

      {priorities.length ? (
        <Card className="space-y-3">
          <h3 className="font-semibold text-slate-900">Suas prioridades</h3>
          <ol className="flex flex-wrap gap-2">
            {priorities.map((priority, index) => (
              <li key={String(priority)} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">
                {index + 1}. {priorityLabel(priority, prioritiesAnswer?.chatbot_questions?.options)}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Card className="space-y-3">
        {answers.map((answer) => (
          <div key={answer.question_id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {answer.chatbot_questions?.prompt ?? 'Pergunta'}
            </p>
            <p className="mt-1 text-sm text-slate-800">{formatAnswer(answer.value, answer.chatbot_questions?.options)}</p>
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold text-slate-900">Prévia do perfil</h3>
        {preview.focus ? <Badge status="confirmada">Foco: {preview.focus}</Badge> : null}
        <div className="flex flex-wrap gap-2">
          {preview.interests.map((interest) => (
            <span key={interest.slug} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">
              {interest.slug}
            </span>
          ))}
        </div>
        <p className="text-sm text-slate-600">{preview.summary || 'Resumo será gerado ao concluir.'}</p>
      </Card>

      <Button className="w-full" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
        {completeMutation.isPending ? 'Gerando perfil…' : 'Confirmar e escolher horário'}
      </Button>
      {completeMutation.isError ? (
        <p className="text-sm text-rose-600">{(completeMutation.error as Error).message}</p>
      ) : null}
    </div>
  );
}
