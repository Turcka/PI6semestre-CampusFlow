import { describe, expect, it } from 'vitest';

import {
  classifyLeadBatch,
  mapImportHeaders,
  normalizeEmail,
  normalizeName,
} from './leads.hygiene.js';
import { normalizePhoneToE164 } from '../../utils/phone.js';

describe('leads.hygiene', () => {
  it('normaliza nome e e-mail', () => {
    expect(normalizeName('  Ana   Beatriz  ')).toBe('Ana Beatriz');
    expect(normalizeEmail('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com');
  });

  it('normaliza telefone BR para E.164', () => {
    expect(normalizePhoneToE164('(11) 98765-4321')).toBe('+5511987654321');
    expect(normalizePhoneToE164('11987654321')).toBe('+5511987654321');
    expect(normalizePhoneToE164('+55 11 98765-4321')).toBe('+5511987654321');
    expect(normalizePhoneToE164('abc')).toBeNull();
  });

  it('mapeia headers PT/EN', () => {
    const mapped = mapImportHeaders({
      'Nome Completo': 'Bruno Lima',
      Email: 'bruno@example.com',
      Telefone: '11999990000',
      Origem: 'feira',
    });
    expect(mapped.fullName).toBe('Bruno Lima');
    expect(mapped.email).toBe('bruno@example.com');
    expect(mapped.phone).toBe('11999990000');
    expect(mapped.source).toBe('feira');
  });

  it('classifica válidos, duplicados e inválidos', () => {
    const result = classifyLeadBatch(
      [
        { fullName: 'Ana Souza', email: 'ana@example.com', phone: '11987654321' },
        { fullName: 'Ana Dup', email: 'ana@example.com', phone: '11987654322' },
        { fullName: 'X', email: null, phone: null },
        { fullName: 'Bruno', email: 'bruno@example.com', phone: '11911112222' },
      ],
      [{ id: 'existing-1', email: 'bruno@example.com', phone: null }],
    );

    expect(result[0]?.hygieneStatus).toBe('valid');
    expect(result[1]?.hygieneStatus).toBe('duplicate');
    expect(result[2]?.hygieneStatus).toBe('invalid');
    expect(result[3]?.hygieneStatus).toBe('duplicate');
    expect(result[3]?.duplicateOf).toBe('existing-1');
  });
});
