import type { ZodError } from '@bv/shared';
import { ApiError } from './apiClient';

export type FieldErrors = Record<string, string>;

/** Primer mensaje por campo. Mostrar los 3 errores de un mismo input no ayuda. */
export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

/** Errores por campo que devuelve la API en `details` (mismo formato que Zod). */
export function fieldErrorsFromApi(err: unknown): FieldErrors {
  if (!(err instanceof ApiError) || !err.details) return {};
  const errors: FieldErrors = {};
  for (const detail of err.details) {
    if (!(detail.path in errors)) errors[detail.path] = detail.message;
  }
  return errors;
}

/** Mensaje a nivel de formulario. Los de campo ya se muestran inline. */
export function formMessage(err: unknown): string | null {
  if (err instanceof ApiError) return err.details?.length ? null : err.message;
  if (err) return 'Ocurrió un error inesperado.';
  return null;
}
