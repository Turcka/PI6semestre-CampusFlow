import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button, Card, Spinner, Textarea } from '@/components/ui';
import { ApiError, publicApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type Question = {
  id: string;
  key: string;
  prompt: string;
  kind: 'single_choice' | 'multi_choice' | 'scale' | 'free_text';
  options: Array<{
    value: string | number;
    label?: string;
    interests?: string[];
    traits?: Record<string, number>;
    focus?: string;
  }>;
  order_index?: number;
};

type NextResponse = {
  question: Question | null;
  progress: number;
  isLast: boolean;
};

type Props = {
  sessionId: string;
  onFinished: () => void;
};

export function ChatbotConversation({ sessionId, onFinished }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [text, setText] = useState('');
  const [history, setHistory] = useState<Array<{ prompt: string; answer: string }>>([]);

  const nextQuery = useQuery({
    queryKey: queryKeys.chatbotNext(sessionId),
    queryFn: () => publicApi<NextResponse>(`/chatbot/sessions/${sessionId}/next`),
  });

  const answerMutation = useMutation({
    mutationFn: async (payload: { questionId: string; value: unknown; prompt: string; answerLabel: string }) => {
      await publicApi(`/chatbot/sessions/${sessionId}/answers`, {
        method: 'POST',
        body: JSON.stringify({ questionId: payload.questionId, value: payload.value }),
      });
      return payload;
    },
    onSuccess: async (payload) => {
      setHistory((prev) => [...prev, { prompt: payload.prompt, answer: payload.answerLabel }]);
      setSelected([]);
      setText('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.chatbotNext(sessionId) });
    },
  });

  const question = nextQuery.data?.question ?? null;
  const progress = nextQuery.data?.progress ?? 0;

  const options = useMemo(() => question?.options ?? [], [question]);

  async function submitCurrent() {
    if (!question) {
      onFinished();
      return;
    }

    let value: unknown;
    let answerLabel = '';

    if (question.kind === 'single_choice') {
      if (!selected[0]) return;
      value = { value: selected[0] };
      answerLabel = options.find((o) => String(o.value) === String(selected[0]))?.label ?? String(selected[0]);
    } else if (question.kind === 'multi_choice') {
      if (!selected.length) return;
      value = { values: selected.map(String) };
      answerLabel = selected
        .map((v) => options.find((o) => String(o.value) === String(v))?.label ?? String(v))
        .join(', ');
    } else if (question.kind === 'scale') {
      if (!selected[0]) return;
      value = { value: Number(selected[0]) };
      answerLabel = String(selected[0]);
    } else {
      if (!text.trim()) return;
      value = { value: text.trim() };
      answerLabel = text.trim();
    }

    try {
      await answerMutation.mutateAsync({
        questionId: question.id,
        value,
        prompt: question.prompt,
        answerLabel,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        // keep UI silent besides disabling
      }
    }
  }

  if (nextQuery.isLoading) return <Spinner label="Preparando perguntas…" />;

  if (!question) {
    return (
      <Card className="space-y-4">
        <p className="text-sm text-slate-600">Questionário concluído. Vamos revisar suas respostas.</p>
        <Button onClick={onFinished}>Ir para revisão</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <div className="space-y-3" aria-live="polite">
        {history.slice(-4).map((item, index) => (
          <div key={`${item.prompt}-${index}`} className="space-y-2">
            <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
              {item.prompt}
            </div>
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-sm text-white">
              {item.answer}
            </div>
          </div>
        ))}

        <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm">
          {question.prompt}
        </div>
      </div>

      <Card className="space-y-3">
        {question.kind === 'single_choice' || question.kind === 'multi_choice' ? (
          <div className="flex flex-col gap-2">
            {options.map((option) => {
              const active = selected.some((v) => String(v) === String(option.value));
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  className={`rounded-xl border px-3 py-3 text-left text-sm ${
                    active ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-700'
                  }`}
                  onClick={() => {
                    if (question.kind === 'single_choice') setSelected([option.value]);
                    else {
                      setSelected((prev) =>
                        active ? prev.filter((v) => String(v) !== String(option.value)) : [...prev, option.value],
                      );
                    }
                  }}
                >
                  {option.label ?? String(option.value)}
                </button>
              );
            })}
          </div>
        ) : null}

        {question.kind === 'scale' ? (
          <div className="flex justify-between gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`h-12 flex-1 rounded-xl border text-sm font-semibold ${
                  selected[0] === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white'
                }`}
                onClick={() => setSelected([n])}
              >
                {n}
              </button>
            ))}
          </div>
        ) : null}

        {question.kind === 'free_text' ? (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite sua resposta" />
        ) : null}

        <Button className="w-full" onClick={() => void submitCurrent()} disabled={answerMutation.isPending}>
          {answerMutation.isPending ? 'Enviando…' : nextQuery.data?.isLast ? 'Finalizar perguntas' : 'Próxima'}
        </Button>
      </Card>
    </div>
  );
}
