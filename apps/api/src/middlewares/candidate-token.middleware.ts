import type { Request, RequestHandler } from 'express';

import { logger } from '../config/logger.js';
import { AppError } from '../utils/app-error.js';

/** Header `X-Candidate-Token` ou, por compatibilidade, `?portalToken=`. */
function readCandidateToken(req: Request): string | undefined {
  const header = req.get('x-candidate-token')?.trim();
  if (header) return header;
  const query = req.query.portalToken;
  return typeof query === 'string' && query.trim() ? query.trim() : undefined;
}

/**
 * Exige o token do portal do candidato e o injeta em `req.candidateToken`. Aqui só se verifica a
 * presença (401); a conferência com o `portal_token` do candidato dono da sessão é feita no
 * service (403), que conhece o `candidate_id`.
 */
export const requireCandidateToken: RequestHandler = (req, _res, next) => {
  const token = readCandidateToken(req);
  if (!token) return next(AppError.unauthorized('Token do candidato ausente.'));
  req.candidateToken = token;
  next();
};

/**
 * Período de tolerância das rotas antigas do chatbot: aceita a chamada sem token (registrando um
 * aviso) e, quando o token vem, ele é conferido no service. Trocar por `requireCandidateToken`
 * quando todos os clientes enviarem o header.
 */
export const optionalCandidateToken: RequestHandler = (req, _res, next) => {
  const token = readCandidateToken(req);
  if (token) req.candidateToken = token;
  else logger.warn({ requestId: req.requestId, method: req.method, route: req.baseUrl + req.path }, 'Rota do chatbot chamada sem X-Candidate-Token');
  next();
};
