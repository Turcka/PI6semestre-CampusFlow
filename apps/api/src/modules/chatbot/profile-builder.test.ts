import { describe, expect, it } from 'vitest';

import { buildCandidateProfile } from './profile-builder.js';

describe('profile-builder', () => {
  it('agrega interesses, traits e foco a partir das respostas', () => {
    const questions = [
      {
        id: 'q1',
        key: 'interests',
        prompt: 'Interesses',
        kind: 'multi_choice' as const,
        options: [
          { value: 'cars', interests: ['carros'], focus: 'tecnico' as const },
          { value: 'code', interests: ['tecnologia'], focus: 'tecnico' as const },
        ],
      },
      {
        id: 'q2',
        key: 'curiosity',
        prompt: 'Curiosidade',
        kind: 'scale' as const,
        options: [],
      },
    ];

    const result = buildCandidateProfile(
      [
        { questionId: 'q1', value: { values: ['cars', 'code'] } },
        { questionId: 'q2', value: { value: 4 } },
      ],
      questions,
    );

    expect(result.focus).toBe('tecnico');
    expect(result.interests.map((i) => i.slug)).toEqual(['carros', 'tecnologia']);
    expect(result.traits.curiosity).toBeCloseTo(0.8);
    expect(result.summary).toContain('tecnico');
  });
});
