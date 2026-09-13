/**
 * Gera horários candidatos a partir de regras semanais (lógica pura / testável).
 * A materialização no banco continua via RPC `generate_visit_slots`.
 */

export type SlotRule = {
  weekday: number; // 0-6
  startTime: string; // HH:mm
  endTime: string;
  slotDurationMinutes: number;
  capacity: number;
  validFrom?: string | null; // YYYY-MM-DD
  validUntil?: string | null;
};

export type SlotException = {
  start: Date;
  end: Date;
  kind: 'block' | 'extra';
};

export type GeneratedSlot = {
  startsAt: Date;
  endsAt: Date;
  capacity: number;
};

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

function atLocal(day: Date, hm: string, timeZoneOffsetMinutes = 0): Date {
  const { h, m } = parseHm(hm);
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, 0));
  d.setUTCMinutes(d.getUTCMinutes() - timeZoneOffsetMinutes);
  return d;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Materializa slots para o intervalo [from, to] (datas inclusivas).
 * `timeZoneOffsetMinutes` é o offset do tenant (ex.: São Paulo = -180).
 */
export function generateSlotsFromRules(
  rules: SlotRule[],
  from: Date,
  to: Date,
  exceptions: SlotException[] = [],
  timeZoneOffsetMinutes = -180,
): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const endDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  while (day <= endDay) {
    const ymd = day.toISOString().slice(0, 10);
    const dow = day.getUTCDay();

    for (const rule of rules) {
      if (rule.weekday !== dow) continue;
      if (rule.validFrom && ymd < rule.validFrom) continue;
      if (rule.validUntil && ymd > rule.validUntil) continue;

      let cursor = atLocal(day, rule.startTime, timeZoneOffsetMinutes);
      const windowEnd = atLocal(day, rule.endTime, timeZoneOffsetMinutes);

      while (cursor.getTime() + rule.slotDurationMinutes * 60_000 <= windowEnd.getTime()) {
        const endsAt = new Date(cursor.getTime() + rule.slotDurationMinutes * 60_000);
        const blocked = exceptions.some(
          (ex) => ex.kind === 'block' && overlaps(cursor, endsAt, ex.start, ex.end),
        );
        if (!blocked) {
          slots.push({ startsAt: new Date(cursor), endsAt, capacity: rule.capacity });
        }
        cursor = endsAt;
      }
    }

    day.setUTCDate(day.getUTCDate() + 1);
  }

  return slots;
}
