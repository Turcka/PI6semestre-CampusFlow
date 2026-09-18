import { AppError } from '../utils/app-error.js';

/** Mapeia erros de RPCs do Postgres para AppError HTTP. */
export function mapRpcError(err: { message?: string; code?: string; details?: string; hint?: string } | null): never {
  const message = err?.message ?? 'Erro no banco de dados.';
  const code = err?.code;

  if (message.includes('SLOT_UNAVAILABLE') || message.includes('SLOT_IN_PAST')) {
    throw AppError.conflict('SLOT_UNAVAILABLE', 'Horário indisponível ou sem vagas.', err?.hint);
  }
  if (message.includes('SLOT_NOT_FOUND')) {
    throw AppError.notFound('Horário não encontrado.');
  }
  if (message.includes('CANDIDATE_NOT_FOUND') || message.includes('LEAD_NOT_FOUND')) {
    throw AppError.notFound('Candidato não encontrado.');
  }
  if (message.includes('PROFILE_INCOMPLETE')) {
    throw AppError.conflict('PROFILE_INCOMPLETE', 'Complete o perfil no chatbot antes de agendar.');
  }
  if (message.includes('NO_ELIGIBLE_PROMOTER')) {
    throw AppError.conflict('NO_ELIGIBLE_PROMOTER', 'Nenhum promotor elegível para esta janela.');
  }
  if (message.includes('VISIT_NOT_FOUND')) {
    throw AppError.notFound('Visita não encontrada.');
  }
  if (message.includes('VISIT_NOT_CANCELLABLE')) {
    throw AppError.conflict('VISIT_NOT_CANCELLABLE', 'Visita não pode ser cancelada neste status.');
  }
  if (message.includes('CANCEL_TOO_LATE')) {
    throw AppError.conflict('CANCEL_TOO_LATE', 'Prazo mínimo para cancelamento não respeitado.');
  }
  if (message.includes('RESCHEDULE_TOO_LATE')) {
    throw AppError.conflict('RESCHEDULE_TOO_LATE', 'Prazo mínimo para reagendamento não respeitado.');
  }
  if (message.includes('INVITATION_NOT_FOUND')) {
    throw AppError.notFound('Convite não encontrado.');
  }
  if (message.includes('INVITATION_NOT_PENDING')) {
    throw AppError.conflict('INVITATION_NOT_PENDING', 'Convite já foi respondido.');
  }
  if (message.includes('INVALID_TRANSITION')) {
    throw AppError.conflict('INVALID_TRANSITION', 'Transição de status inválida.');
  }
  if (message.includes('EVENT_NOT_FOUND')) {
    throw AppError.notFound('Evento não encontrado.');
  }
  if (message.includes('EVENT_ALREADY_DECLINED')) {
    throw AppError.conflict('EVENT_ALREADY_DECLINED', 'Evento já foi recusado.');
  }
  if (message.includes('CHECKIN_TOKEN_INVALID')) {
    throw AppError.notFound('QR Code inválido.');
  }
  if (message.includes('CHECKIN_OUT_OF_WINDOW')) {
    throw AppError.conflict('CHECKIN_OUT_OF_WINDOW', 'Fora da janela de check-in.', err?.hint);
  }
  if (message.includes('VISIT_NOT_CHECKABLE')) {
    throw AppError.conflict('VISIT_NOT_CHECKABLE', 'Visita não pode fazer check-in neste status.');
  }
  if (code === '23P01' || message.includes('exclusion') || message.includes('no_overlap')) {
    throw AppError.conflict('PARTICIPANT_BUSY', 'Participante já possui compromisso neste horário.');
  }
  if (code === '42501' || message.includes('TENANT_MISMATCH') || message.includes('FORBIDDEN')) {
    throw AppError.forbidden('Operação não permitida.');
  }

  throw new AppError(500, 'RPC_ERROR', message, { code, details: err?.details, hint: err?.hint });
}
