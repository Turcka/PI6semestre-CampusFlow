import { useMutation, useQuery } from '@tanstack/react-query';

import { Badge, Button, Card, Spinner } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type ReviewPayload = {
  session: { id: string; status: string };
  answers: Array<{
    question_id: string;
    value: unknown;
    chatbot_questions?: { prompt?: string; key?: string } | null;
  }>;
  preview: {
    interests: Array<{ slug: string; score: number }>;
    focus: string | null;
    summary: string;
  };
};

type CompletePayload = {
  candidateId: string;
  summary: string | null;
  focus: string | null;
  interests: Array<{ score: number; interest_categories?: { name?: string; slug?: string } | null }>;
};

type Props = {
  sessionId: string;
  onCompleted: (result: CompletePayload) => void;
};

function formatAnswer(value: unknown) {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.values)) return record.values.join(', ');
    if (record.value != null) return String(record.value);
  }
  return JSON.stringify(value);
}

export function ReviewStep({ sessionId, onCompleted }: Props) {
  const reviewQuery = useQuery({
    queryKey: queryKeys.chatbotReview(sessionId),
    queryFn: () => publicApi<ReviewPayload>(`/chatbot/sessions/${sessionId}/review`),
  });

  const completeMutation = useMutation({
    mutationFn: () => publicApi<CompletePayload>(`/chatbot/sessions/${sessionId}/complete`, { method: 'POST' }),
    onSuccess: onCompleted,
  });

  if (reviewQuery.isLoading) return <Spinner label="Montando revisão…" />;
  if (!reviewQuery.data) return <p className="text-rose-600">Não foi possível carregar a revisão.</p>;

  const { answers, preview } = reviewQuery.data;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Revise suas respostas</h2>
        <p className="mt-1 text-sm text-slate-600">Confira antes de gerar o perfil e escolher o horário.</p>
      </div>

      <Card className="space-y-3">
        {answers.map((answer) => (
          <div key={answer.question_id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {answer.chatbot_questions?.prompt ?? 'Pergunta'}
            </p>
            <p className="mt-1 text-sm text-slate-800">{formatAnswer(answer.value)}</p>
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
