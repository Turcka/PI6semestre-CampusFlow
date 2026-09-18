import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Card, Input, Label, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { v1Api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<'single_choice' | 'multi_choice' | 'scale' | 'free_text'>('single_choice');

  const questionsQuery = useQuery({
    queryKey: queryKeys.chatbotQuestions(),
    queryFn: () => v1Api<Array<{ id: string; key: string; prompt: string; kind: string; audience: string }>>('/chatbot/questions?includeInactive=false'),
  });

  const weightsQuery = useQuery({
    queryKey: queryKeys.matchWeights(),
    queryFn: () => v1Api<Array<{ criterion: string; weight: number; kind: string }>>('/match/weights'),
  });

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

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Perguntas do chatbot e pesos do match (núcleo administrativo)." />

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
