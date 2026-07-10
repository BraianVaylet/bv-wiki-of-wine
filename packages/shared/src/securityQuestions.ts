/**
 * Preguntas de seguridad para recuperación de cuenta (sin email).
 * Fuente única para cliente (mostrar opciones) y servidor (validar id).
 */

export interface SecurityQuestion {
  id: number;
  text: string;
}

export const SECURITY_QUESTIONS: readonly SecurityQuestion[] = [
  { id: 1, text: '¿Cuál es el nombre de tu madre?' },
  { id: 2, text: '¿Cuál es el nombre de tu pareja?' },
  { id: 3, text: '¿Cómo se llamaba tu primera mascota?' },
  { id: 4, text: '¿Cuál fue tu primer auto?' },
  { id: 5, text: '¿En qué ciudad naciste?' },
  { id: 6, text: '¿Cómo se llamaba tu escuela primaria?' },
  { id: 7, text: '¿Cuál es tu comida favorita?' },
  { id: 8, text: '¿Cuál es el segundo nombre de tu padre?' },
] as const;

export function questionById(id: number): SecurityQuestion | null {
  return SECURITY_QUESTIONS.find((q) => q.id === id) ?? null;
}

/** Respuesta de seguridad: tolerante a mayúsculas y espacios extra. */
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}
