import type { ScoreResult } from './scoring.js';

/** Transforma breakdown do match em frase legível (paridade com SQL `_match_build_justification`). */
export function buildJustification(score: number, result: Pick<ScoreResult, 'breakdown' | 'sharedInterests'>): string {
  const parts: string[] = [];
  const course = result.breakdown.course_affinity?.raw ?? 0;
  if (course >= 0.6) parts.push('curso compatível');
  if (result.sharedInterests.length) {
    parts.push(
      `${result.sharedInterests.length} interesses em comum (${result.sharedInterests.join(', ')})`,
    );
  }
  const focus = result.breakdown.focus_alignment?.raw ?? 0;
  if (focus >= 0.8) parts.push('foco alinhado');

  const pct = Math.round(score * 100);
  return `${pct}% - ${parts.length ? parts.join(', ') : 'compatibilidade geral'}`;
}
