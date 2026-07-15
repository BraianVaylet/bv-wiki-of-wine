/**
 * Constantes compartidas: límites de validación, enums de dominio y códigos de
 * error. Fuente única para cliente y servidor (ver docs/02-data-model.md).
 */

export const LIMITS = {
  alias: { min: 3, max: 24, pattern: /^[a-zA-Z0-9._-]+$/ },
  password: { min: 10, max: 128 },
  securityAnswer: { min: 2, max: 100 },
  wineName: { min: 1, max: 120 },
  wineryName: { min: 1, max: 80 },
  grapeName: { min: 2, max: 40 },
  place: { max: 60 },
  reviewNotes: { max: 500 },
  vintage: { min: 1900, max: 2100 },
  searchQuery: { max: 60 },
} as const;

/** Puntaje: enteros 1..5. El "sin puntuar" es `null`, nunca 0 (docs/02 §4). */
export const RATING = { min: 1, max: 5 } as const;

/** Máximo de uvas por vino: es un blend, no un experimento (RN-7). */
export const MAX_GRAPES_PER_WINE = 5;

export const WINE_TYPES = ['tinto', 'blanco', 'rosado', 'espumante', 'naranjo', 'dulce'] as const;
export type WineType = (typeof WINE_TYPES)[number];

export const WINE_TYPE_LABELS: Record<WineType, string> = {
  tinto: 'Tinto',
  blanco: 'Blanco',
  rosado: 'Rosado',
  espumante: 'Espumante',
  naranjo: 'Naranjo',
  dulce: 'Dulce',
};

/** Ejes opcionales de una reseña. El orden define el orden de la UI. */
export const REVIEW_AXES = ['taste', 'aroma', 'body', 'valueForMoney'] as const;
export type ReviewAxis = (typeof REVIEW_AXES)[number];

export const REVIEW_AXIS_LABELS: Record<ReviewAxis, string> = {
  taste: 'Gusto',
  aroma: 'Aroma',
  body: 'Cuerpo',
  valueForMoney: 'Precio',
};

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  CSRF_INVALID: 'CSRF_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  /** Solo cliente: el fetch nunca llegó al servidor. */
  NETWORK: 'NETWORK',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Formatos de imagen aceptados en el upload de etiqueta (validados por magic bytes). */
export const ACCEPTED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
