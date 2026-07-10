import type { Context } from 'hono';
import { type ZodTypeAny, z } from 'zod';
import { validationError } from '../lib/errors';

function toDetails(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/** Parsea y valida el body JSON con un schema Zod; arma el 400 uniforme. */
export async function parseBody<T extends ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw validationError('El cuerpo debe ser JSON válido.');
  }
  const result = schema.safeParse(raw);
  if (!result.success)
    throw validationError('Revisá los campos marcados.', toDetails(result.error));
  return result.data;
}

/** Valida la query string contra un schema Zod. */
export function parseQuery<T extends ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) throw validationError('Parámetros inválidos.', toDetails(result.error));
  return result.data;
}

/** Valida un id de path (entero positivo). */
export function parseId(value: string | undefined): number {
  const parsed = z.coerce.number().int().positive().safeParse(value);
  if (!parsed.success) throw validationError('Id inválido.');
  return parsed.data;
}
