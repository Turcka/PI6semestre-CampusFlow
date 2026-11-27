import { assistantSettingsSchema, type AssistantSettings } from '@campusflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Button, Card, FieldError, Input, Label, Spinner, Textarea } from '@/components/ui';
import { ApiError, v1Api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type SettingsPayload = { assistant: AssistantSettings; llmAvailable: boolean };

const MAX_FACTS = 40;

const FIELD_MESSAGES: Record<string, string> = {
  persona_name: 'O nome da persona precisa ter de 2 a 40 caracteres.',
  tone: 'Descreva o tom em 3 a 120 caracteres.',
  max_turns: 'O máximo de turnos precisa ser um número inteiro entre 4 e 40.',
  facts: 'Cada fato precisa de um tópico (2 a 60 caracteres) e de um texto (3 a 500 caracteres).',
};

/** Card "Assistente virtual": liga/desliga, persona, tom, fatos institucionais e máximo de turnos. */
export function AssistantSettingsCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AssistantSettings | null>(null);
  const [maxTurns, setMaxTurns] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const settingsQuery = useQuery({
    queryKey: queryKeys.tenantSettings(),
    queryFn: () => v1Api<SettingsPayload>('/tenants/current/settings'),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setForm(settingsQuery.data.assistant);
    setMaxTurns(String(settingsQuery.data.assistant.max_turns));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (assistant: AssistantSettings) =>
      v1Api<SettingsPayload>('/tenants/current/settings', { method: 'PATCH', body: JSON.stringify({ assistant }) }),
    onSuccess: (payload) => {
      queryClient.setQueryData(queryKeys.tenantSettings(), payload);
      setSaved(true);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o assistente.'),
  });

  function update(patch: Partial<AssistantSettings>) {
    setSaved(false);
    setError(null);
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function updateFact(index: number, patch: Partial<AssistantSettings['facts'][number]>) {
    if (!form) return;
    update({ facts: form.facts.map((fact, i) => (i === index ? { ...fact, ...patch } : fact)) });
  }

  function save() {
    if (!form) return;
    const parsed = assistantSettingsSchema.safeParse({ ...form, max_turns: Number(maxTurns) });
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? '');
      setError(FIELD_MESSAGES[field] ?? 'Revise os campos do assistente.');
      return;
    }
    setError(null);
    saveMutation.mutate(parsed.data);
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Assistente virtual</h2>
        <p className="text-sm text-slate-600">
          Conduz por conversa a coleta do perfil do visitante. Se estiver desligado ou indisponível, o candidato responde pelo
          questionário de opções.
        </p>
      </div>

      {settingsQuery.isLoading ? (
        <Spinner />
      ) : settingsQuery.isError || !form ? (
        <p className="text-sm text-rose-600">Não foi possível carregar a configuração do assistente.</p>
      ) : (
        <>
          {!settingsQuery.data?.llmAvailable ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
              A LLM está desligada no ambiente da API (<code>LLM_ENABLED</code> e <code>LLM_API_KEY</code>). Enquanto isso, o
              chatbot segue pelo questionário de opções mesmo com o assistente ligado aqui.
            </p>
          ) : null}

          <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={form.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            Usar o assistente virtual no cadastro de visitantes
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="assistant-persona">Nome da persona</Label>
              <Input id="assistant-persona" value={form.persona_name} maxLength={40} onChange={(e) => update({ persona_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="assistant-turns">Máximo de turnos por conversa (4 a 40)</Label>
              <Input
                id="assistant-turns"
                type="number"
                min={4}
                max={40}
                value={maxTurns}
                onChange={(e) => {
                  setSaved(false);
                  setError(null);
                  setMaxTurns(e.target.value);
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="assistant-tone">Tom de voz</Label>
              <Input
                id="assistant-tone"
                value={form.tone}
                maxLength={120}
                placeholder="ex.: acolhedor e direto"
                onChange={(e) => update({ tone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Fatos institucionais</h3>
              <p className="text-xs text-slate-500">
                O assistente só responde perguntas sobre a instituição com base nesta lista; o que não estiver aqui vira dúvida
                para a visita. Este texto é enviado ao provedor de IA: não inclua dados pessoais.
              </p>
            </div>
            {form.facts.map((fact, index) => (
              <div key={index} className="space-y-2 rounded-xl bg-slate-50 p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`assistant-fact-topic-${index}`}>Tópico</Label>
                    <Input
                      id={`assistant-fact-topic-${index}`}
                      value={fact.topic}
                      maxLength={60}
                      placeholder="ex.: Bolsas"
                      onChange={(e) => updateFact(index, { topic: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    className="min-h-11 px-3 text-xs"
                    aria-label={`Remover fato ${index + 1}`}
                    onClick={() => update({ facts: form.facts.filter((_, i) => i !== index) })}
                  >
                    Remover
                  </Button>
                </div>
                <div>
                  <Label htmlFor={`assistant-fact-text-${index}`}>Texto</Label>
                  <Textarea
                    id={`assistant-fact-text-${index}`}
                    value={fact.text}
                    maxLength={500}
                    onChange={(e) => updateFact(index, { text: e.target.value })}
                  />
                </div>
              </div>
            ))}
            {!form.facts.length ? <p className="text-sm text-slate-500">Nenhum fato cadastrado.</p> : null}
            <Button
              variant="secondary"
              disabled={form.facts.length >= MAX_FACTS}
              onClick={() => update({ facts: [...form.facts, { topic: '', text: '' }] })}
            >
              Adicionar fato
            </Button>
          </div>

          <FieldError>{error}</FieldError>
          <div className="flex items-center gap-3">
            <Button disabled={saveMutation.isPending} onClick={save}>
              {saveMutation.isPending ? 'Salvando…' : 'Salvar assistente'}
            </Button>
            {saved ? (
              <p className="text-sm text-emerald-700" role="status">
                Configuração salva.
              </p>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
