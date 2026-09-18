import type { VisitFocus } from '@campusflow/shared';

export type ProfileQuestionKind = 'single_choice' | 'multi_choice' | 'scale' | 'free_text';

export type ProfileOption = {
  value: string | number;
  label?: string;
  interests?: string[];
  traits?: Record<string, number>;
  focus?: VisitFocus;
};

export type ProfileQuestion = {
  id: string;
  key: string;
  prompt: string;
  kind: ProfileQuestionKind;
  options: ProfileOption[];
};

export type ProfileAnswer = {
  questionId: string;
  value: unknown;
};

export type CandidateProfilePreview = {
  interests: Array<{ slug: string; score: number }>;
  traits: Record<string, number>;
  focus: VisitFocus | null;
  summary: string;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function selectedValues(value: unknown): Array<string | number> {
  if (value == null) return [];
  if (typeof value === 'string' || typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.values)) return selectedValues(record.values);
    if (record.value !== undefined) return selectedValues(record.value);
  }
  return [];
}

export function buildCandidateProfile(answers: ProfileAnswer[], questions: ProfileQuestion[]): CandidateProfilePreview {
  const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.value]));
  const interestScores = new Map<string, number>();
  const traits: Record<string, number> = {};
  const focusCounts = new Map<VisitFocus, number>();

  for (const question of questions) {
    const answer = answersByQuestion.get(question.id);
    const selected = new Set(selectedValues(answer).map(String));

    if (question.kind === 'scale') {
      const numeric = Number(selectedValues(answer)[0]);
      if (Number.isFinite(numeric)) traits[question.key] = clamp(numeric / 5);
      continue;
    }

    for (const option of question.options) {
      if (!selected.has(String(option.value))) continue;
      if (option.focus) focusCounts.set(option.focus, (focusCounts.get(option.focus) ?? 0) + 1);
      for (const interest of option.interests ?? []) {
        interestScores.set(interest, clamp((interestScores.get(interest) ?? 0) + 0.5));
      }
      for (const [trait, delta] of Object.entries(option.traits ?? {})) {
        traits[trait] = clamp((traits[trait] ?? 0) + delta);
      }
    }
  }

  const interests = [...interestScores.entries()]
    .map(([slug, score]) => ({ slug, score }))
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  const focus = [...focusCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topInterests = interests.slice(0, 3).map((item) => item.slug.replace(/-/g, ' '));

  const summaryParts = [
    focus ? `Foco preferido: ${focus}` : null,
    topInterests.length ? `Principais interesses: ${topInterests.join(', ')}` : null,
  ].filter(Boolean);

  return { interests, traits, focus, summary: summaryParts.join('. ') };
}
