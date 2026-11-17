import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { Button, Card, Spinner, Textarea } from '@/components/ui';
import { ApiError, publicApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const MAX_LENGTH = 1000;

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string };
type QuickReply = { value: string; label: string };

type Conversation = {
  mode: 'guided' | 'llm';
  status: string;
  progress: number;
  done: boolean;
  turnsLeft: number;
  fallbackReason: string | null;
  messages: ChatMessage[];
};

type TurnResponse = {
  message: ChatMessage | null;
  extracted: Record<string, unknown>;
  rejected: string[];
  questionsForVisit: string[];
  quickReplies: QuickReply[];
  progress: number;
  done: boolean;
  turnsLeft: number;
  fallback: { mode: 'guided'; reason: string } | null;
};

type Props = {
  sessionId: string;
  portalToken: string;
  /** Nome da persona do tenant (ex.: "Sofia"); usado no indicador de digitação. */
  personaName?: string;
  /** Perguntas obrigatórias respondidas e o visitante escolheu seguir para a revisão. */
  onFinished: () => void;
  /** A conversa não pode continuar (ou o visitante preferiu as opções): seguir pelo questionário por botões. */
  onFallback: () => void;
};

export function AssistantChat({ sessionId, portalToken, personaName, onFinished, onFallback }: Props) {
  const queryClient = useQueryClient();
  const basePath = `/chatbot/sessions/${sessionId}`;
  const messagesKey = queryKeys.chatbotMessages(sessionId);

  const [text, setText] = useState('');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const assistantName = personaName?.trim() || 'A secretaria';

  // A primeira leitura também gera a saudação no servidor; por isso não é repetida automaticamente.
  const conversationQuery = useQuery({
    queryKey: messagesKey,
    queryFn: () => publicApi<Conversation>(`${basePath}/messages`, { candidateToken: portalToken }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const conversation = conversationQuery.data;
  const serverMode = conversation?.mode;
  const serverStatus = conversation?.status;

  // Callbacks em ref: o efeito abaixo deve reagir só ao estado vindo do servidor.
  const callbacks = useRef({ onFinished, onFallback });
  callbacks.current = { onFinished, onFallback };

  // O servidor pode ter voltado a sessão para os botões (LLM indisponível) ou ela já foi concluída.
  useEffect(() => {
    if (serverStatus === 'completed') callbacks.current.onFinished();
    else if (serverMode === 'guided') callbacks.current.onFallback();
  }, [serverMode, serverStatus]);

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      publicApi<TurnResponse>(`${basePath}/messages`, {
        method: 'POST',
        candidateToken: portalToken,
        body: JSON.stringify({ content }),
      }),
    onMutate: (content) => {
      setError(null);
      setQuickReplies([]);
      setText('');
      const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: 'user', content, createdAt: new Date().toISOString() };
      queryClient.setQueryData<Conversation>(messagesKey, (current) =>
        current ? { ...current, messages: [...current.messages, optimistic] } : current,
      );
      return { optimisticId: optimistic.id, content };
    },
    onSuccess: (turn) => {
      if (turn.fallback) {
        onFallback();
        return;
      }
      queryClient.setQueryData<Conversation>(messagesKey, (current) =>
        current
          ? {
              ...current,
              progress: turn.progress,
              done: turn.done,
              turnsLeft: turn.turnsLeft,
              messages: turn.message ? [...current.messages, turn.message] : current.messages,
            }
          : current,
      );
      setQuickReplies(turn.done ? [] : turn.quickReplies);
    },
    onError: (err, _content, context) => {
      if (err instanceof ApiError && err.code === 'SESSION_NOT_LLM') {
        onFallback();
        return;
      }
      if (err instanceof ApiError && err.code === 'SESSION_COMPLETED') {
        onFinished();
        return;
      }
      // A mensagem não foi processada: tira o balão otimista e devolve o texto ao campo.
      queryClient.setQueryData<Conversation>(messagesKey, (current) =>
        current ? { ...current, messages: current.messages.filter((message) => message.id !== context?.optimisticId) } : current,
      );
      if (context?.content) setText(context.content);
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Muitas mensagens em pouco tempo. Aguarde alguns segundos e envie de novo.'
          : 'Não foi possível enviar sua mensagem. Tente de novo ou continue respondendo com opções.',
      );
    },
    onSettled: () => inputRef.current?.focus(),
  });

  // Mesmo que o servidor não confirme a troca de modo, o questionário por botões funciona.
  const switchMutation = useMutation({
    mutationFn: () =>
      publicApi(`${basePath}/mode`, { method: 'POST', candidateToken: portalToken, body: JSON.stringify({ mode: 'guided' }) }),
    onSettled: () => onFallback(),
  });

  const messageCount = conversation?.messages.length ?? 0;
  const isSending = sendMutation.isPending;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messageCount, isSending]);

  function send(raw: string) {
    const content = raw.trim();
    if (!content || isSending || switchMutation.isPending) return;
    sendMutation.mutate(content.slice(0, MAX_LENGTH));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(text);
    }
  }

  const switchButton = (
    <button
      type="button"
      className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline disabled:opacity-50"
      disabled={switchMutation.isPending || isSending}
      onClick={() => switchMutation.mutate()}
    >
      {switchMutation.isPending ? 'Trocando…' : 'Prefiro responder com opções'}
    </button>
  );

  if (conversationQuery.isLoading) return <Spinner label="Iniciando a conversa…" />;

  if (conversationQuery.isError || !conversation) {
    return (
      <Card className="space-y-3">
        <p className="text-sm text-rose-600">Não foi possível iniciar a conversa agora.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void conversationQuery.refetch()}>
            Tentar novamente
          </Button>
          <Button onClick={onFallback}>Responder com opções</Button>
        </div>
      </Card>
    );
  }

  // Sessão já está no modo de botões ou concluída: o efeito acima cuida da transição.
  if (conversation.mode !== 'llm' || conversation.status === 'completed') return <Spinner label="Preparando perguntas…" />;

  return (
    <div className="space-y-4">
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="Progresso da conversa"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(conversation.progress * 100)}
      >
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.round(conversation.progress * 100)}%` }} />
      </div>

      <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-3" aria-live="polite" aria-label="Conversa">
        {conversation.messages.map((message) =>
          message.role === 'assistant' ? (
            <div
              key={message.id}
              className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
            >
              {message.content}
            </div>
          ) : (
            <div
              key={message.id}
              className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-sm text-white"
            >
              {message.content}
            </div>
          ),
        )}
        {isSending ? (
          <div className="w-fit rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm italic text-slate-500 shadow-sm" role="status">
            {assistantName} está digitando…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {quickReplies.length && !isSending ? (
        <div className="flex flex-wrap gap-2" aria-label="Sugestões de resposta">
          {quickReplies.map((reply) => (
            <button
              key={reply.value}
              type="button"
              className="rounded-full border border-brand-200 bg-brand-50 px-3 py-2 text-left text-sm font-medium text-brand-800 hover:border-brand-400"
              onClick={() => send(reply.label)}
            >
              {reply.label}
            </button>
          ))}
        </div>
      ) : null}

      {conversation.done ? (
        <Card className="space-y-3">
          <p className="text-sm text-slate-700">Já tenho o que preciso para personalizar sua visita. Vamos revisar?</p>
          <Button className="w-full" onClick={onFinished}>
            Ir para revisão
          </Button>
        </Card>
      ) : null}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="assistant-message" className="sr-only">
          Sua mensagem
        </label>
        <Textarea
          id="assistant-message"
          ref={inputRef}
          className="min-h-16"
          rows={2}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={conversation.done ? 'Quer acrescentar algo? Escreva aqui.' : 'Escreva sua resposta…'}
        />
        {error ? (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          {switchButton}
          <Button type="submit" disabled={!text.trim() || isSending || switchMutation.isPending}>
            {isSending ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
