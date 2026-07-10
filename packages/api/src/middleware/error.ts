import type { ApiError } from '@bv/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { env } from '../env';
import { AppError } from '../lib/errors';

/** Traduce errores a la forma uniforme de la API. Nunca filtra el stack al cliente. */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    const body: ApiError = {
      error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) },
    };
    return c.json(body, err.status as ContentfulStatusCode);
  }

  if (env.LOG_LEVEL !== 'error') {
    console.error('[error]', err.message, err.stack);
  }
  const body: ApiError = { error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado.' } };
  return c.json(body, 500);
}
