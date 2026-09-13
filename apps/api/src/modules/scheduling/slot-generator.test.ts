import { describe, expect, it } from 'vitest';

import { generateSlotsFromRules } from './slot-generator.js';

describe('slot-generator', () => {
  it('gera slots de 60 min em janela 09-11', () => {
    // 2026-09-14 é segunda-feira (weekday 1)
    const from = new Date('2026-09-14T00:00:00Z');
    const to = new Date('2026-09-14T00:00:00Z');
    const slots = generateSlotsFromRules(
      [{ weekday: 1, startTime: '09:00', endTime: '11:00', slotDurationMinutes: 60, capacity: 1 }],
      from,
      to,
      [],
      0,
    );
    expect(slots).toHaveLength(2);
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-09-14T09:00:00.000Z');
    expect(slots[0]?.endsAt.toISOString()).toBe('2026-09-14T10:00:00.000Z');
    expect(slots[1]?.startsAt.toISOString()).toBe('2026-09-14T10:00:00.000Z');
  });

  it('respeita bloqueios', () => {
    const from = new Date('2026-09-14T00:00:00Z');
    const to = new Date('2026-09-14T00:00:00Z');
    const slots = generateSlotsFromRules(
      [{ weekday: 1, startTime: '09:00', endTime: '11:00', slotDurationMinutes: 60, capacity: 1 }],
      from,
      to,
      [
        {
          kind: 'block',
          start: new Date('2026-09-14T09:00:00Z'),
          end: new Date('2026-09-14T10:00:00Z'),
        },
      ],
      0,
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-09-14T10:00:00.000Z');
  });
});
