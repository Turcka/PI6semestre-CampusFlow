import { TEMPLATE_VARIABLES } from '@campusflow/shared';

/** Substitui `{{chave}}` pelos valores do mapa de variáveis. */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

/** Extrai nomes de variáveis usados no corpo do template. */
export function extractTemplateVariables(body: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function assertKnownTemplateVariables(body: string): string[] {
  const used = extractTemplateVariables(body);
  const unknown = used.filter((v) => !(TEMPLATE_VARIABLES as readonly string[]).includes(v));
  return unknown;
}

/** Monta componentes de parâmetros de template WhatsApp na ordem das variáveis listadas. */
export function buildWhatsAppTemplateComponents(
  variableOrder: string[],
  vars: Record<string, string | number | null | undefined>,
): Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }> {
  return [
    {
      type: 'body',
      parameters: variableOrder.map((key) => ({
        type: 'text' as const,
        text: String(vars[key] ?? ''),
      })),
    },
  ];
}
