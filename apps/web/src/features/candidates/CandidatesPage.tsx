import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, EmptyState, Input, PageHeader, Spinner } from '@/components/ui';
import { InsightsPanel, parseInsights } from '@/features/chatbot/InsightsPanel';
import { v1Api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type Candidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  status: string;
  preferred_focus: string | null;
  profile_summary: string | null;
  profile_completed_at: string | null;
  created_at: string;
};

type Paginated<T> = { data: T[]; total: number };

type Transcript = {
  session: { id: string; mode: 'guided' | 'llm'; status: string; turns: number; fallbackReason: string | null } | null;
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }>;
};

/** Conversa do candidato com o secretário virtual. Só o admin acessa; carregada sob demanda. */
function TranscriptSection({ candidateId }: { candidateId: string }) {
  const [open, setOpen] = useState(false);
  const transcriptQuery = useQuery({
    queryKey: queryKeys.candidateTranscript(candidateId),
    queryFn: () => v1Api<Transcript>(`/candidates/${candidateId}/transcript`),
    enabled: open,
  });
  const messages = transcriptQuery.data?.messages ?? [];

  return (
    <section className="space-y-2 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Conversa com o assistente</h3>
        <Button variant="ghost" className="min-h-9 px-3 text-xs" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Ocultar' : 'Ver conversa'}
        </Button>
      </div>
      {!open ? null : transcriptQuery.isLoading ? (
        <Spinner />
      ) : transcriptQuery.isError ? (
        <p className="text-sm text-rose-600">Não foi possível carregar a conversa.</p>
      ) : !messages.length ? (
        <p className="text-sm text-slate-500">Este candidato respondeu pelo questionário de opções; não há conversa registrada.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Dados pessoais digitados no chat são mascarados antes de gravar. A conversa é apagada 180 dias após a conclusão.
          </p>
          <ol className="max-h-96 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
            {messages.map((message) => (
              <li key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    message.role === 'user' ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <span className="sr-only">{message.role === 'user' ? 'Candidato: ' : 'Assistente: '}</span>
                  {message.content}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export function CandidatesPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.candidates({ q }),
    queryFn: () => v1Api<Paginated<Candidate>>(`/candidates?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.candidate(selectedId ?? ''),
    queryFn: () => v1Api<Record<string, unknown>>(`/candidates/${selectedId}`),
    enabled: Boolean(selectedId),
  });
  const insights = parseInsights(detailQuery.data?.ai_insights);

  return (
    <div>
      <PageHeader title="Candidatos" description="Busca por nome, e-mail ou CPF." />
      <div className="mb-4 flex gap-2">
        <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {listQuery.isLoading ? (
        <Spinner />
      ) : !(listQuery.data?.data.length ?? 0) ? (
        <EmptyState title="Nenhum candidato" description="Cadastros públicos e manuais aparecerão aqui." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <ul>
              {(listQuery.data?.data ?? []).map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={`flex w-full items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                      selectedId === candidate.id ? 'bg-brand-50' : ''
                    }`}
                    onClick={() => setSelectedId(candidate.id)}
                  >
                    <div>
                      <p className="font-medium text-slate-900">{candidate.full_name}</p>
                      <p className="text-xs text-slate-500">{candidate.email}</p>
                    </div>
                    <Badge status={candidate.status === 'agendado' ? 'agendada' : candidate.status === 'visitou' ? 'realizada' : 'agendada'}>
                      {candidate.status}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <Card>
            {!selectedId ? (
              <p className="text-sm text-slate-500">Selecione um candidato para ver o detalhe.</p>
            ) : detailQuery.isLoading ? (
              <Spinner />
            ) : detailQuery.data ? (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">{String((detailQuery.data as Candidate).full_name)}</h2>
                <p className="text-sm text-slate-600">{String((detailQuery.data as Candidate).email ?? '')}</p>
                <p className="text-sm text-slate-600">
                  CPF: {String((detailQuery.data as Candidate).cpf ?? '—')}
                </p>
                <p className="text-sm text-slate-700">
                  {(detailQuery.data as Candidate).profile_summary ?? 'Perfil ainda não concluído no chatbot.'}
                </p>
                {insights ? <InsightsPanel insights={insights} variant="plain" /> : null}
                <TranscriptSection key={selectedId} candidateId={selectedId} />
                <Button variant="secondary" onClick={() => setSelectedId(null)}>
                  Fechar
                </Button>
              </div>
            ) : (
              <p className="text-sm text-rose-600">Falha ao carregar detalhe.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
