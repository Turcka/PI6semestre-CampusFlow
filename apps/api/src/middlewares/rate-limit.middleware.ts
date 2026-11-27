import rateLimit from 'express-rate-limit';

export const publicRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente em instantes.' } },
});

/**
 * Secretário virtual: cada chamada pode custar uma requisição ao provedor LLM, então o limite é
 * por sessão (além do `publicRateLimit` por IP aplicado em todo o router público).
 */
export const assistantRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `assistant:${req.params.id ?? req.ip ?? 'unknown'}`,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitas mensagens em pouco tempo. Aguarde um instante e tente de novo.' } },
});

export const authenticatedRateLimit = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente em instantes.' } },
});
