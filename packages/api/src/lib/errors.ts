import type { ErrorCode, ErrorDetail } from '@bv/shared';

/** Error de dominio con status HTTP + código de la API (docs/03-api-spec.md §1). */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validationError = (msg: string, details?: ErrorDetail[]) =>
  new AppError(400, 'VALIDATION_ERROR', msg, details);

export const unauthenticated = (msg = 'Iniciá sesión para continuar.') =>
  new AppError(401, 'UNAUTHENTICATED', msg);

export const csrfInvalid = () => new AppError(403, 'CSRF_INVALID', 'Token CSRF inválido.');

export const forbidden = (msg = 'No tenés permiso para hacer eso.') =>
  new AppError(403, 'FORBIDDEN', msg);

export const notFound = (msg = 'No encontrado.') => new AppError(404, 'NOT_FOUND', msg);

export const conflict = (msg: string, details?: ErrorDetail[]) =>
  new AppError(409, 'CONFLICT', msg, details);

export const payloadTooLarge = (msg = 'El archivo es demasiado grande.') =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', msg);

export const unsupportedMediaType = (msg = 'Formato de archivo no soportado.') =>
  new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', msg);

export const rateLimited = (msg = 'Demasiados intentos. Probá de nuevo en unos minutos.') =>
  new AppError(429, 'RATE_LIMITED', msg);
