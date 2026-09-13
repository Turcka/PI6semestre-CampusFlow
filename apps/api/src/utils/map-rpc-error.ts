import { AppError } from '../utils/app-error.js';

/** Mapeia erros de RPCs do Postgres (book_visit, check_in_visit, etc.) para AppError HTTP. */
export function mapRpcError(err: { message?: string; code?: string; details?: string; hint?: string } | null): never {
  const message = err?.message ?? 'Erro no banco de dados.';
  const code = err?.code;

  if (message === 'SLOT_UNAVAILABLE' || message.includes('SLOT_UNAVAILABLE') || message.includes('SLOT_IN_PAST')) {
    throw AppError.conflict('SLOT_UNAVAILABLE', 'Horário indisponível ou sem vagas.', err?.hint);
  }
  if (message === 'SLOT_NOT_FOUND' || message.includes('SLOT_NOT_FOUND')) {
    throw AppError.notFound('Horário não encontrado.');
  }
  if (message === 'LEAD_NOT_FOUND' || message.includes('LEAD_NOT_FOUND')) {
    throw AppError.notFound('Lead não encontrado.');
  }
  if (message === 'VISIT_NOT_FOUND' || message.includes('VISIT_NOT_FOUND')) {
    throw AppError.notFound('Visita não encontrada.');
  }
  if (message === 'VISIT_NOT_CANCELLABLE' || message.includes('VISIT_NOT_CANCELLABLE')) {
    throw AppError.conflict('VISIT_NOT_CANCELLABLE', 'Visita não pode ser cancelada neste status.');
  }
  if (message === 'EVENT_NOT_FOUND' || message.includes('EVENT_NOT_FOUND')) {
    throw AppError.notFound('Evento não encontrado.');
  }
  if (message === 'EVENT_ALREADY_DECLINED' || message.includes('EVENT_ALREADY_DECLINED')) {
    throw AppError.conflict('EVENT_ALREADY_DECLINED', 'Evento já foi recusado.');
  }
  if (message === 'CHECKIN_TOKEN_INVALID' || message.includes('CHECKIN_TOKEN_INVALID')) {
    throw AppError.notFound('QR Code inválido.');
  }
  if (message === 'CHECKIN_OUT_OF_WINDOW' || message.includes('CHECKIN_OUT_OF_WINDOW')) {
    throw AppError.conflict('CHECKIN_OUT_OF_WINDOW', 'Fora da janela de check-in.', err?.hint);
  }
  if (message === 'VISIT_NOT_CHECKABLE' || message.includes('VISIT_NOT_CHECKABLE')) {
    throw AppError.conflict('VISIT_NOT_CHECKABLE', 'Visita não pode fazer check-in neste status.');
  }
  if (code === '23P01' || message.includes('exclusion') || message.includes('no_overlap')) {
    throw AppError.conflict('COORDINATOR_BUSY', 'Coordenador já possui compromisso neste horário.');
  }
  if (code === '42501' || message.includes('TENANT_MISMATCH')) {
    throw AppError.forbidden('Operação não permitida para este tenant.');
  }

  throw new AppError(500, 'RPC_ERROR', message, { code, details: err?.details, hint: err?.hint });
}
