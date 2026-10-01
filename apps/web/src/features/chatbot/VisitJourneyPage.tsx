import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Card, Stepper } from '@/components/ui';
import { ChatbotConversation } from '@/features/chatbot/ChatbotConversation';
import { RegisterStep } from '@/features/chatbot/RegisterStep';
import { ReviewStep } from '@/features/chatbot/ReviewStep';
import { ScheduledStep } from '@/features/scheduling/ScheduledStep';
import { WindowPicker } from '@/features/scheduling/WindowPicker';
import { loadCandidateSession, saveCandidateSession } from '@/lib/candidate-token';

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
  const [scheduled, setScheduled] = useState<{
    visitId: string;
    status: string;
    period: string;
    professorRequested: boolean;
    promoterName?: string | null;
    professorName?: string | null;
  } | null>(null);
  const [profileSummary, setProfileSummary] = useState<string | null>(existing?.profileSummary ?? null);

  const currentStepLabel = useMemo(() => STEPS[step] ?? '', [step]);

  function persist(next: { sessionId?: string; portalToken?: string; candidateId?: string; step: number; profileSummary?: string | null }) {
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
    });
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
              });
              setSessionId(payload.sessionId);
              setPortalToken(payload.portalToken);
              setCandidateId(payload.candidateId);
              setStep(1);
            }}
          />
        ) : null}

        {step === 1 && sessionId ? (
          <ChatbotConversation
            sessionId={sessionId}
            onFinished={() => {
              persist({ step: 2 });
              setStep(2);
            }}
          />
        ) : null}

        {step === 2 && sessionId ? (
          <ReviewStep
            sessionId={sessionId}
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
