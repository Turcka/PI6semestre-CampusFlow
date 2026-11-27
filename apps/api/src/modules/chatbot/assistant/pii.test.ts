import { describe, expect, it } from 'vitest';

import { maskPii } from './pii.js';

describe('maskPii', () => {
  it('mascara CPF com e sem pontuação', () => {
    expect(maskPii('meu cpf é 529.982.247-25')).toBe('meu cpf é [cpf]');
    expect(maskPii('cpf 52998224725, pode anotar')).toBe('cpf [cpf], pode anotar');
    expect(maskPii('529982247-25')).toBe('[cpf]');
  });

  it('mascara e-mail', () => {
    expect(maskPii('me escreve em lucas.silva+visita@escola.com.br por favor')).toBe('me escreve em [email] por favor');
  });

  it('mascara telefones brasileiros em formatos comuns', () => {
    expect(maskPii('liga no +55 11 98765-4321')).toBe('liga no [telefone]');
    expect(maskPii('meu zap é (11) 98765-4321')).toBe('meu zap é [telefone]');
    expect(maskPii('fixo (11) 3456-7890')).toBe('fixo [telefone]');
    expect(maskPii('11 98765-4321')).toBe('[telefone]');
    expect(maskPii('whats 11987654321')).toBe('whats [telefone]');
    expect(maskPii('é 98765-4321')).toBe('é [telefone]');
    expect(maskPii('5511987654321')).toBe('[telefone]');
  });

  it('mascara vários dados na mesma mensagem', () => {
    expect(maskPii('Sou a Ana, ana@exemplo.com, cpf 529.982.247-25, tel (11) 98765-4321')).toBe(
      'Sou a Ana, [email], cpf [cpf], tel [telefone]',
    );
  });

  it('não altera texto sem dados pessoais', () => {
    const samples = [
      'Quero ver os laboratórios e saber sobre bolsas.',
      'Estou no 3º ano, tenho 17 anos e moro a 15 km do campus.',
      'A mensalidade cabe em 2026? Minha nota foi 780 no ENEM de 2025.',
      'De 1 a 5, eu diria 4.',
      'Vou com 2 amigos às 14:30 do dia 20/11/2026.',
    ];
    for (const sample of samples) expect(maskPii(sample)).toBe(sample);
  });
});
