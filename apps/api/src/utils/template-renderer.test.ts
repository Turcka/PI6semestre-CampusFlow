import { describe, expect, it } from 'vitest';

import {
  assertKnownTemplateVariables,
  buildWhatsAppTemplateComponents,
  extractTemplateVariables,
  renderTemplate,
} from './template-renderer.js';

describe('template-renderer', () => {
  it('substitui variáveis', () => {
    const out = renderTemplate('Olá {{candidato.nome}} em {{visita.data}}', {
      'candidato.nome': 'Ana',
      'visita.data': '10/09/2026',
    });
    expect(out).toBe('Olá Ana em 10/09/2026');
  });

  it('extrai e valida variáveis', () => {
    expect(extractTemplateVariables('{{candidato.nome}} / {{foo.bar}}')).toEqual([
      'candidato.nome',
      'foo.bar',
    ]);
    expect(assertKnownTemplateVariables('Oi {{candidato.nome}}')).toEqual([]);
    expect(assertKnownTemplateVariables('Oi {{inexistente}}')).toEqual(['inexistente']);
  });

  it('monta componentes WhatsApp', () => {
    const components = buildWhatsAppTemplateComponents(['candidato.nome', 'visita.hora'], {
      'candidato.nome': 'Ana',
      'visita.hora': '09:00',
    });
    expect(components[0]?.parameters).toEqual([
      { type: 'text', text: 'Ana' },
      { type: 'text', text: '09:00' },
    ]);
  });
});
