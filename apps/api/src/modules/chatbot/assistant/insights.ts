import { aiInsightsSchema, type AiInsights } from '@campusflow/shared';

/**
 * Lê `candidates.ai_insights`. Devolve `null` quando o candidato não conversou com o assistente
 * (coluna vazia) ou quando o conteúdo está fora do formato esperado.
 */
export function readAiInsights(raw: unknown): AiInsights | null {
  const parsed = aiInsightsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
