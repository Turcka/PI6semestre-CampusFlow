/**
 * Erro de domínio com status HTTP e código legível.
 * Exemplos: `new AppError(409, 'SLOT_UNAVAILABLE', 'Horário já reservado.')`
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Não autenticado.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Sem permissão para esta ação.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Recurso não encontrado.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string, details?: unknown) {
    return new AppError(409, code, message, details);
  }
}
