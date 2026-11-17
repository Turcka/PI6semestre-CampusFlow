import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Card, Stepper } from '@/components/ui';
import { AssistantChat } from '@/features/chatbot/AssistantChat';
import { ChatbotConversation } from '@/features/chatbot/ChatbotConversation';
import { RegisterStep, type CampusPublic, type SessionMode } from '@/features/chatbot/RegisterStep';
import { ReviewStep } from '@/features/chatbot/ReviewStep';
import { ScheduledStep } from '@/features/scheduling/ScheduledStep';
import { WindowPicker } from '@/features/scheduling/WindowPicker';
import { publicApi } from '@/lib/api';
import { loadCandidateSession, saveCandidateSession } from '@/lib/candidate-token';
import { queryKeys } from '@/lib/query-keys';

const STEPS = ['Cadastro', 'Questionário', 'Revisão', 'Horário', 'Confirmação'];

export function VisitJourneyPage() {
  const { campusSlug = 'sao-caetano' } = useParams();
  const existing = loadCandidateSession();
  const canResume = Boolean(existing && existing.campusSlug === campusSlug && existing.candidateId && existing.portalToken);
  const [step, setStep] = useState(() => {
    if (!canResume || !existing) return 0;
    if (existing.step != null) return existing.step;
    return existing.sessionId ? 1 : 0;
  });
  const [sessionId, setSessionId] = useState(existing?.sessionId ?? '');
  const [portalToken, setPortalToken] = useState(existing?.portalToken ?? '');
  const [candidateId, setCandidateId] = useState(existing?.candidateId ?? '');
  const [mode, setMode] = useState<SessionMode>(existing?.mode === 'llm' ? 'llm' : 'guided');
  /** A conversa com o assistente foi interrompida e a jornada seguiu pelos botões. */
  const [fellBack, setFellBack] = useState(false);
  const [scheduled, setScheduled] = useState<{
    visitId: string;
    status: string;
    period: string;
    professorRequested: boolean;
    promoterName?: string | null;
    professorName?: string | null;
  } | null>(null);
  const [profileSummary, setProfileSummary] = useState<string | null>(existing?.profileSummary ?? null);

  // Mesma consulta do cadastro (já em cache): só para saber o nome da persona do assistente.
  const campusQuery = useQuery({
    queryKey: queryKeys.campus(campusSlug),
    queryFn: () => publicApi<CampusPublic>(`/campuses/${campusSlug}`),
    enabled: mode === 'llm',
  });

  const currentStepLabel = useMemo(() => {
    if (step === 1 && mode === 'llm') return 'Conversa';
    return STEPS[step] ?? '';
  }, [step, mode]);

  function persist(next: {
    sessionId?: string;
    portalToken?: string;
    candidateId?: string;
    step: number;
    profileSummary?: string | null;
    mode?: SessionMode;
  }) {
    const resolvedToken = next.portalToken ?? portalToken;
    const resolvedCandidate = next.candidateId ?? candidateId;
    if (!resolvedToken || !resolvedCandidate) return;
    saveCandidateSession({
      sessionId: next.sessionId ?? sessionId,
      portalToken: resolvedToken,
      candidateId: resolvedCandidate,
      campusSlug,
      step: next.step,
      profileSummary: next.profileSummary ?? profileSummary,
      mode: next.mode ?? mode,
    });
  }

  function goToReview() {
    persist({ step: 2 });
    setStep(2);
  }

  return (
    <div className="space-y-6">
      <Stepper steps={STEPS} current={step} />
      <Card>
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Etapa: {currentStepLabel}
        </p>

        {step === 0 ? (
          <RegisterStep
            campusSlug={campusSlug}
            onRegistered={(payload) => {
              saveCandidateSession({
                sessionId: payload.sessionId,
                portalToken: payload.portalToken,
                candidateId: payload.candidateId,
                campusSlug,
                step: 1,
                mode: payload.mode,
              });
              setSessionId(payload.sessionId);
              setPortalToken(payload.portalToken);
              setCandidateId(payload.candidateId);
              setMode(payload.mode);
              setFellBack(false);
              setStep(1);
            }}
          />
        ) : null}

        {step === 1 && sessionId && mode === 'llm' ? (
          <AssistantChat
            sessionId={sessionId}
            portalToken={portalToken}
            personaName={campusQuery.data?.assistant?.personaName}
            onFinished={goToReview}
            onFallback={() => {
              // As respostas já extraídas da conversa ficam salvas; os botões continuam de onde parou.
              setMode('guided');
              setFellBack(true);
              persist({ step: 1, mode: 'guided' });
            }}
          />
        ) : null}

        {step === 1 && sessionId && mode !== 'llm' ? (
          <div className="space-y-4">
            {fellBack ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                Vamos continuar com perguntas rápidas de múltipla escolha. O que você já respondeu foi mantido.
              </p>
            ) : null}
            <ChatbotConversation sessionId={sessionId} candidateToken={portalToken || undefined} onFinished={goToReview} />
          </div>
        ) : null}

        {step === 2 && sessionId ? (
          <ReviewStep
            sessionId={sessionId}
            portalToken={portalToken || undefined}
            onCompleted={(result) => {
              setProfileSummary(result.summary);
              persist({ step: 3, profileSummary: result.summary });
              setStep(3);
            }}
          />
        ) : null}

        {step === 3 && candidateId && portalToken ? (
          <div className="space-y-4">
            {profileSummary ? (
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">{profileSummary}</p>
            ) : null}
            <WindowPicker
              candidateId={candidateId}
              portalToken={portalToken}
              onScheduled={(result) => {
                setScheduled(result);
                setStep(4);
              }}
            />
          </div>
        ) : null}

        {step === 4 && scheduled ? (
          <ScheduledStep
            visitId={scheduled.visitId}
            status={scheduled.status}
            period={scheduled.period}
            professorRequested={scheduled.professorRequested}
            promoterName={scheduled.promoterName}
            professorName={scheduled.professorName}
            portalToken={portalToken}
          />
        ) : null}
      </Card>
    </div>
  );
}
