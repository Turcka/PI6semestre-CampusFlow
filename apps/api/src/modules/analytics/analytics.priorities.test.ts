import { describe, expect, it } from 'vitest';

import { aggregatePriorities } from './analytics.service.js';

describe('aggregatePriorities', () => {
  it('soma citações entre cursos e posições e ordena pelas mais citadas', () => {
    const result = aggregatePriorities([
      { priority_key: 'empregabilidade', rank: 1, candidates: 3 },
      { priority_key: 'empregabilidade', rank: 2, candidates: '1' },
      { priority_key: 'custo_bolsas', rank: 1, candidates: 1 },
      { priority_key: 'custo_bolsas', rank: 2, candidates: 2 },
      { priority_key: 'custo_bolsas', rank: 3, candidates: 1 },
      { priority_key: 'localizacao', rank: '2', candidates: 1 },
    ]);

    expect(result.respondents).toBe(4);
    expect(result.items).toEqual([
      { key: 'empregabilidade', label: 'Empregabilidade e estágios', mentions: 4, top1: 3, avgRank: 1.3 },
      { key: 'custo_bolsas', label: 'Mensalidade, bolsas e financiamento', mentions: 4, top1: 1, avgRank: 2 },
      { key: 'localizacao', label: 'Localização e deslocamento', mentions: 1, top1: 0, avgRank: 2 },
    ]);
  });

  it('ignora chaves desconhecidas e linhas sem contagem ou posição válida', () => {
    const result = aggregatePriorities([
      { priority_key: 'inventada', rank: 1, candidates: 5 },
      { priority_key: null, rank: 1, candidates: 5 },
      { priority_key: 'reputacao', rank: 0, candidates: 2 },
      { priority_key: 'reputacao', rank: 1, candidates: 0 },
      { priority_key: 'reputacao', rank: null, candidates: null },
    ]);

    expect(result).toEqual({ respondents: 0, items: [] });
  });
});
