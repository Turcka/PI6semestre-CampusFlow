/**
 * Normaliza um timestamptz do Postgres para ISO-8601 aceito pelo `Date` do JS:
 *   `2026-10-16 19:00:00+00`    → `2026-10-16T19:00:00+00:00`
 *   `2026-10-16 16:00:00.5-03`  → `2026-10-16T16:00:00.5-03:00`
 */
export function normalizePgTimestamp(raw: string): string {
  let value = raw.trim().replace(' ', 'T');
  // offset curto (+00, -03) → +00:00 / -03:00
  value = value.replace(/([+-]\d{2})$/, '$1:00');
  // offset sem dois-pontos (+0000) → +00:00
  value = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return value;
}

/**
 * Converte um `tstzrange` serializado pelo PostgREST
 * (ex.: `["2026-10-16 19:00:00+00","2026-10-16 20:00:00+00")`) em datas JS.
 */
export function parseTstzrange(period: string | null | undefined): { start: Date; end: Date } | null {
  if (!period) return null;
  const match = /^[[(]\s*"?([^",]+?)"?\s*,\s*"?([^")\]]+?)"?\s*[)\]]$/.exec(period.trim());
  if (!match) return null;
  const start = new Date(normalizePgTimestamp(match[1]!));
  const end = new Date(normalizePgTimestamp(match[2]!));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}
