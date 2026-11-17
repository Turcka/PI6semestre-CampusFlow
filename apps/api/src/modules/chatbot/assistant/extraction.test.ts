import { describe, expect, it } from 'vitest';

import type { ProfileQuestion } from '../profile-builder.js';
import { synthesisResponseSchema, toValidAnswers, turnResponseSchema } from './extraction.js';

const questions: ProfileQuestion[] = [
  {
    id: 'q-foco',
    key: 'foco_visita',
    prompt: 'O que você mais quer ver na visita?',
    kind: 'single_choice',
    options: [
      { value: 'tecnico', label: 'Laboratórios e tecnologia' },
      { value: 'academico', label: 'Salas de aula e professores' },
    ],
  },
  {
    id: 'q-prioridades',
    key: 'prioridades_matricula',
    prompt: 'O que pesa mais na matrícula?',
    kind: 'multi_choice',
    options: [
      { value: 'custo_bolsas', label: 'Mensalidade, bolsas e financiamento' },
      { value: 'empregabilidade', label: 'Empregabilidade e estágios' },
      { value: 'infraestrutura', label: 'Laboratórios e infraestrutura' },
    ],
  },
  { id: 'q-escala', key: 'curiosidade', prompt: 'De 1 a 5, quanto você é curioso?', kind: 'scale', options: [] },
  { id: 'q-livre', key: 'expectativa', prompt: 'O que você espera da visita?', kind: 'free_text', options: [] },
];

describe('toValidAnswers', () => {
  it('aceita single_choice pelo value', () => {
    const result = toValidAnswers({ foco_visita: 'tecnico' }, questions);
    expect(result.answers).toEqual([{ questionId: 'q-foco', key: 'foco_visita', value: { value: 'tecnico' } }]);
    expect(result.accepted).toEqual({ foco_visita: 'tecnico' });
    expect(result.rejected).toEqual([]);
  });

  it('aceita single_choice pelo label normalizado (sem acento, minúsculo)', () => {
    const result = toValidAnswers({ foco_visita: '  LABORATORIOS e tecnologia ' }, questions);
    expect(result.answers[0]?.value).toEqual({ value: 'tecnico' });
  });

  it('rejeita valores fora das options', () => {
    const result = toValidAnswers({ foco_visita: 'esportes', prioridades_matricula: ['nada_a_ver'] }, questions);
    expect(result.answers).toEqual([]);
    expect(result.rejected).toEqual(['foco_visita', 'prioridades_matricula']);
  });

  it('multi_choice mantém só os válidos, sem repetir, na ordem devolvida', () => {
    const result = toValidAnswers(
      { prioridades_matricula: ['empregabilidade', 'inventado', 'Mensalidade, bolsas e financiamento', 'empregabilidade'] },
      questions,
    );
    expect(result.answers[0]?.value).toEqual({ values: ['empregabilidade', 'custo_bolsas'] });
    expect(result.accepted).toEqual({ prioridades_matricula: ['empregabilidade', 'custo_bolsas'] });
  });

  it('aceita os formatos { value } e { values } devolvidos por alguns modelos', () => {
    const result = toValidAnswers(
      { foco_visita: { value: 'academico' }, prioridades_matricula: { values: ['infraestrutura'] } },
      questions,
    );
    expect(result.answers.map((answer) => answer.value)).toEqual([{ value: 'academico' }, { values: ['infraestrutura'] }]);
  });

  it('rejeita keys inexistentes ou não pendentes', () => {
    const pending = questions.filter((question) => question.key !== 'foco_visita');
    const result = toValidAnswers({ foco_visita: 'tecnico', pergunta_inventada: 'x' }, pending);
    expect(result.answers).toEqual([]);
    expect(result.rejected).toEqual(['foco_visita', 'pergunta_inventada']);
  });

  it('scale aceita só inteiros de 1 a 5', () => {
    expect(toValidAnswers({ curiosidade: 4 }, questions).answers[0]?.value).toEqual({ value: 4 });
    expect(toValidAnswers({ curiosidade: '5' }, questions).answers[0]?.value).toEqual({ value: 5 });
    for (const invalid of [0, 6, 3.5, 'muito', null, '']) {
      expect(toValidAnswers({ curiosidade: invalid }, questions).rejected).toEqual(['curiosidade']);
    }
  });

  it('free_text é aparado, mascarado e limitado a 500 caracteres', () => {
    const result = toValidAnswers({ expectativa: `  ver os labs, me liga no (11) 98765-4321 ${'x'.repeat(600)}` }, questions);
    const value = (result.answers[0]?.value as { value: string }).value;
    expect(value.startsWith('ver os labs, me liga no [telefone]')).toBe(true);
    expect(value).toHaveLength(500);
    expect(toValidAnswers({ expectativa: '   ' }, questions).rejected).toEqual(['expectativa']);
    expect(toValidAnswers({ expectativa: 42 }, questions).rejected).toEqual(['expectativa']);
  });
});

describe('turnResponseSchema', () => {
  it('aplica defaults e tolera null nos campos opcionais', () => {
    const parsed = turnResponseSchema.parse({ reply: ' Oi! ', extracted: null, nextQuestionKey: null, questionsForVisit: null, done: null });
    expect(parsed).toEqual({ reply: 'Oi!', extracted: {}, questionsForVisit: [], offTopic: false, done: false });
  });

  it('exige reply não vazia e com até 700 caracteres', () => {
    expect(turnResponseSchema.safeParse({ reply: '   ' }).success).toBe(false);
    expect(turnResponseSchema.safeParse({ reply: 'a'.repeat(701) }).success).toBe(false);
    expect(turnResponseSchema.safeParse({ extracted: {} }).success).toBe(false);
  });
});

describe('synthesisResponseSchema', () => {
  it('descarta o que está fora dos enums, reordena o rank e mascara PII', () => {
    const parsed = synthesisResponseSchema.parse({
      summary: 'Lucas quer ver os laboratórios. Contato: lucas@exemplo.com.',
      priorities: [
        { key: 'custo_bolsas', rank: 5, evidence: 'queria saber se tem bolsa' },
        { key: 'prestigio', rank: 1 },
        { key: 'empregabilidade', rank: 2 },
        { key: 'custo_bolsas', rank: 1 },
      ],
      goals: ['ver os laboratórios', 42, 'ver os laboratórios'],
      doubts: ['Quais bolsas existem?'],
      objections: null,
      decisionStage: 'quase_la',
      influencers: ['pais', 'vizinho', 'pais'],
      schoolMoment: 'em3',
      decisionTimeline: null,
      suggestedFocus: 'tecnico',
      talkingPoints: ['a', 'b', 'c', 'd'],
    });

    expect(parsed.summary).toBe('Lucas quer ver os laboratórios. Contato: [email].');
    expect(parsed.insights.priorities).toEqual([
      { key: 'empregabilidade', rank: 1 },
      { key: 'custo_bolsas', rank: 2, evidence: 'queria saber se tem bolsa' },
    ]);
    expect(parsed.insights.goals).toEqual(['ver os laboratórios']);
    expect(parsed.insights.objections).toEqual([]);
    expect(parsed.insights.decisionStage).toBeNull();
    expect(parsed.insights.influencers).toEqual(['pais']);
    expect(parsed.insights.schoolMoment).toBe('em3');
    expect(parsed.insights.suggestedFocus).toBe('tecnico');
    expect(parsed.insights.talkingPoints).toEqual(['a', 'b', 'c']);
  });

  it('reprova quando não há summary', () => {
    expect(synthesisResponseSchema.safeParse({ priorities: [] }).success).toBe(false);
  });
});
