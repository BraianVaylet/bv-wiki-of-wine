import { z } from 'zod';
import { LIMITS, RATING } from '../constants';

/**
 * Un eje opcional: entero 1..5 o `null` ("no lo puntué").
 * `0` se rechaza a propósito: confundirlo con "sin puntuar" arruina los
 * promedios (ver docs/02-data-model.md §4).
 */
const axis = z
  .number()
  .int('El puntaje es un número entero.')
  .min(RATING.min, `El puntaje debe estar entre ${RATING.min} y ${RATING.max}.`)
  .max(RATING.max, `El puntaje debe estar entre ${RATING.min} y ${RATING.max}.`)
  .nullish()
  .transform((v) => v ?? null);

/** La estrella global es lo único obligatorio: un tap y listo. */
const overall = z
  .number()
  .int('El puntaje es un número entero.')
  .min(RATING.min, `El puntaje debe estar entre ${RATING.min} y ${RATING.max}.`)
  .max(RATING.max, `El puntaje debe estar entre ${RATING.min} y ${RATING.max}.`);

export const upsertReviewSchema = z.object({
  overall,
  taste: axis,
  aroma: axis,
  body: axis,
  valueForMoney: axis,
  notes: z
    .string()
    .trim()
    .max(LIMITS.reviewNotes.max, `La nota no puede superar ${LIMITS.reviewNotes.max} caracteres.`)
    .default(''),
});

export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;
