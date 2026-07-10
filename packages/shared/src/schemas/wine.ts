import { z } from 'zod';
import { LIMITS, MAX_GRAPES_PER_WINE, WINE_TYPES } from '../constants';
import { optionalText } from './common';

/** La cosecha futura no existe, pero un vino del año que viene ya se vende. */
const MAX_VINTAGE_OFFSET_YEARS = 1;

const name = z
  .string()
  .trim()
  .min(LIMITS.wineName.min, 'Poné el nombre del vino.')
  .max(LIMITS.wineName.max, `El nombre no puede superar ${LIMITS.wineName.max} caracteres.`);

const vintage = z
  .number()
  .int('La cosecha es un año entero.')
  .min(LIMITS.vintage.min, `La cosecha tiene que ser posterior a ${LIMITS.vintage.min}.`)
  .refine(
    (y) => y <= new Date().getFullYear() + MAX_VINTAGE_OFFSET_YEARS,
    'Esa cosecha todavía no existe.',
  )
  .nullish()
  .transform((v) => v ?? null);

const wineryName = z
  .string()
  .trim()
  .min(LIMITS.wineryName.min)
  .max(LIMITS.wineryName.max, `La bodega no puede superar ${LIMITS.wineryName.max} caracteres.`)
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

const grapeNames = z
  .array(
    z
      .string()
      .trim()
      .min(LIMITS.grapeName.min, 'Nombre de uva demasiado corto.')
      .max(LIMITS.grapeName.max, 'Nombre de uva demasiado largo.'),
  )
  .max(MAX_GRAPES_PER_WINE, `Como máximo ${MAX_GRAPES_PER_WINE} uvas por vino.`)
  // Un blend con "Malbec" dos veces es un error de tipeo, no un blend.
  .transform((names) => [...new Map(names.map((n) => [n.toLowerCase(), n])).values()])
  .default([]);

export const createWineSchema = z.object({
  name,
  type: z.enum(WINE_TYPES, { errorMap: () => ({ message: 'Elegí el tipo de vino.' }) }),
  vintage,
  wineryName,
  country: optionalText(LIMITS.place.max, 'El país'),
  region: optionalText(LIMITS.place.max, 'La región'),
  grapeNames,
});

/** PATCH parcial: solo los campos presentes se actualizan. */
export const updateWineSchema = createWineSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'No hay nada para actualizar.');

export const wineQuerySchema = z.object({
  query: z.string().trim().max(LIMITS.searchQuery.max).optional(),
  type: z.enum(WINE_TYPES).optional(),
  grapeId: z.coerce.number().int().positive().optional(),
  sort: z.enum(['recent', 'rating']).default('recent'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Solo con `sort=recent`. Formato `${createdAt}_${id}`. */
  cursor: z
    .string()
    .regex(/^\d+_\d+$/, 'Cursor inválido.')
    .optional(),
  /** Solo con `sort=rating`. */
  page: z.coerce.number().int().min(1).default(1),
});

export type CreateWineInput = z.infer<typeof createWineSchema>;
export type UpdateWineInput = z.infer<typeof updateWineSchema>;
export type WineQuery = z.infer<typeof wineQuerySchema>;
