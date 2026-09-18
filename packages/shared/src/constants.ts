/** Título padronizado do evento de agenda. */
export const VISIT_EVENT_TITLE_PREFIX = 'Visita Individual - ';
export const GROUP_VISIT_EVENT_TITLE_PREFIX = 'Visita em Grupo - ';

export function buildVisitEventTitle(candidateName: string, type: 'individual' | 'group' = 'individual') {
  const prefix = type === 'group' ? GROUP_VISIT_EVENT_TITLE_PREFIX : VISIT_EVENT_TITLE_PREFIX;
  return `${prefix}${candidateName.trim()}`;
}

/** Variáveis disponíveis nos templates de mensagem (Revisão 2). */
export const TEMPLATE_VARIABLES = [
  'candidato.nome',
  'candidato.primeiro_nome',
  'candidato.curso',
  'candidato.resumo',
  'visita.data',
  'visita.hora',
  'visita.tipo',
  'visita.link_aceite',
  'visita.roteiro',
  'promotor.nome',
  'professor.nome',
  'campus.nome',
  'campus.endereco',
  'campus.link_mapa',
  'instituicao.nome',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/** Nomes das filas pgmq no Supabase. */
export const QUEUES = {
  MESSAGES_OUTBOUND: 'messages_outbound',
  RUBEUS_OUTBOUND: 'rubeus_outbound',
} as const;

export const DEFAULT_VISIT_DURATION_MINUTES = 60;
export const DEFAULT_SLOT_CAPACITY = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
