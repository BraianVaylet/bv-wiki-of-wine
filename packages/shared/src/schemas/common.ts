import { type ZodError, z } from 'zod';
import type { ErrorCode } from '../constants';

/** Re-export para que el front no tenga que declarar `zod` como dep directa. */
export type { ZodError };

/** Param de id en URL (entero positivo). */
export const idParamSchema = z.coerce.number().int().positive();

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Forma uniforme de error de la API (ver docs/03-api-spec.md §1). */
export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}

/**
 * Texto opcional: `""` y espacios en blanco colapsan a `null`.
 * Evita tener que preguntar `IS NULL OR = ''` disperso por el código.
 */
export function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} no puede superar ${max} caracteres.`)
    .transform((s) => (s.length === 0 ? null : s))
    .nullish()
    .transform((s) => s ?? null);
}
