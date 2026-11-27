import { MATRICULATION_PRIORITY_LABELS, aiInsightsSchema, type AiInsights } from '@campusflow/shared';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui';

/** Parte dos insights exibida para a equipe (sem resumo, modelo ou data de geração). */
export type CandidateInsights = Pick<
  AiInsights,
  | 'priorities'
  | 'goals'
  | 'doubts'
  | 'objections'
  | 'decisionStage'
  | 'influencers'
  | 'schoolMoment'
  | 'decisionTimeline'
  | 'suggestedFocus'
  | 'talkingPoints'
>;

const DECISION_STAGE_LABELS: Record<NonNullable<AiInsights['decisionStage']>, string> = {
  explorando: 'Explorando opções',
  comparando: 'Comparando instituições',
  decidido: 'Praticamente decidido',
};

const INFLUENCER_LABELS: Record<AiInsights['influencers'][number], string> = {
  sozinho: 'Decide por conta própria',
  pais: 'Pais ou responsáveis',
  amigos: 'Amigos',
  escola: 'Escola e professores',
};

const SCHOOL_MOMENT_LABELS: Record<NonNullable<AiInsights['schoolMoment']>, string> = {
  em2: '2º ano do ensino médio',
  em3: '3º ano do ensino médio',
  concluido: 'Ensino médio concluído',
  transferencia: 'Transferência de outra faculdade',
  outro: 'Outro',
};

const DECISION_TIMELINE_LABELS: Record<NonNullable<AiInsights['decisionTimeline']>, string> = {
  este_semestre: 'Ainda neste semestre',
  proximo_semestre: 'No próximo semestre',
  proximo_ano: 'No próximo ano',
  indefinido: 'Sem prazo definido',
};

const FOCUS_LABELS: Record<NonNullable<AiInsights['suggestedFocus']>, string> = {
  tecnico: 'Técnico',
  academico: 'Acadêmico',
  profissional: 'Profissional',
  institucional: 'Institucional',
};

/** Lê `candidates.ai_insights` vindo da API; `null` quando o candidato não conversou com o assistente. */
export function parseInsights(raw: unknown): AiInsights | null {
  const parsed = aiInsightsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function hasContent(insights: CandidateInsights) {
  return Boolean(
    insights.priorities.length ||
      insights.goals.length ||
      insights.doubts.length ||
      insights.objections.length ||
      insights.talkingPoints.length ||
      insights.influencers.length ||
      insights.decisionStage ||
      insights.schoolMoment ||
      insights.decisionTimeline ||
      insights.suggestedFocus,
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Insights da conversa com o secretário virtual. `variant="cards"` rende um card por bloco (briefing no celular);
 * `variant="plain"` rende seções simples para uso dentro de um card existente.
 */
export function InsightsPanel({ insights, variant = 'cards' }: { insights: CandidateInsights; variant?: 'cards' | 'plain' }) {
  if (!hasContent(insights)) return null;

  const priorities = [...insights.priorities].sort((a, b) => a.rank - b.rank);
  const decision = [
    insights.decisionStage ? ['Estágio', DECISION_STAGE_LABELS[insights.decisionStage]] : null,
    insights.decisionTimeline ? ['Prazo', DECISION_TIMELINE_LABELS[insights.decisionTimeline]] : null,
    insights.influencers.length ? ['Quem participa', insights.influencers.map((item) => INFLUENCER_LABELS[item]).join(', ')] : null,
    insights.schoolMoment ? ['Momento escolar', SCHOOL_MOMENT_LABELS[insights.schoolMoment]] : null,
    insights.suggestedFocus ? ['Foco sugerido', FOCUS_LABELS[insights.suggestedFocus]] : null,
  ].filter((row): row is [string, string] => row !== null);

  const sections: Array<{ title: string; body: ReactNode }> = [];

  if (priorities.length) {
    sections.push({
      title: 'O que pesa na matrícula',
      body: (
        <ol className="space-y-2">
          {priorities.map((priority) => (
            <li key={priority.key} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                {priority.rank}
              </span>
              <span>
                <span className="font-medium text-slate-900">{MATRICULATION_PRIORITY_LABELS[priority.key]}</span>
                {priority.evidence ? <span className="block text-xs text-slate-500">“{priority.evidence}”</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ),
    });
  }
  if (insights.doubts.length) sections.push({ title: 'Dúvidas para esclarecer na visita', body: <BulletList items={insights.doubts} /> });
  if (decision.length) {
    sections.push({
      title: 'Momento da decisão',
      body: (
        <dl className="space-y-1 text-sm">
          {decision.map(([label, value]) => (
            <div key={label} className="flex flex-wrap gap-x-2">
              <dt className="text-slate-500">{label}:</dt>
              <dd className="font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      ),
    });
  }
  if (insights.talkingPoints.length) sections.push({ title: 'Pontos de conversa', body: <BulletList items={insights.talkingPoints} /> });
  if (insights.goals.length) sections.push({ title: 'Objetivos', body: <BulletList items={insights.goals} /> });
  if (insights.objections.length) sections.push({ title: 'Receios e objeções', body: <BulletList items={insights.objections} /> });

  if (variant === 'plain') {
    return (
      <div className="space-y-4">
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
            {section.body}
          </section>
        ))}
      </div>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <Card key={section.title} className="space-y-3">
          <h3 className="font-semibold text-slate-900">{section.title}</h3>
          {section.body}
        </Card>
      ))}
    </>
  );
}
