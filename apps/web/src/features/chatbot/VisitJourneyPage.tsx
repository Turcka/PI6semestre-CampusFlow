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
  const [step, setStep] = useState(() => {
    if (!existing || existing.campusSlug !== campusSlug) return 0;
    return 1;
  });
  const [sessionId, setSessionId] = useState(existing?.sessionId ?? '');
  const [portalToken, setPortalToken] = useState(existing?.portalToken ?? '');
  const [candidateId, setCandidateId] = useState(existing?.candidateId ?? '');
  const [scheduled, setScheduled] = useState<{
    visitId: string;
    status: string;
    period: string;
    professorRequested: boolean;
  } | null>(null);
  const [profileSummary, setProfileSummary] = useState<string | null>(null);

  const currentStepLabel = useMemo(() => STEPS[step] ?? '', [step]);

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
              });
              setSessionId(payload.sessionId);
              setPortalToken(payload.portalToken);
              setCandidateId(payload.candidateId);
              setStep(1);
            }}
          />
        ) : null}

        {step === 1 && sessionId ? (
          <ChatbotConversation sessionId={sessionId} onFinished={() => setStep(2)} />
        ) : null}

        {step === 2 && sessionId ? (
          <ReviewStep
            sessionId={sessionId}
            onCompleted={(result) => {
              setProfileSummary(result.summary);
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
            portalToken={portalToken}
          />
        ) : null}
      </Card>
    </div>
  );
}
