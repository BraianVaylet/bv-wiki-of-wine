import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env';

const DEFAULT_TOKEN_BYTES = 32;

/** Token aleatorio opaco (hex). */
export function randomToken(bytes = DEFAULT_TOKEN_BYTES): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * HMAC-SHA256 con SESSION_SECRET. Se usa para guardar el token de sesión: en la
 * DB vive el HMAC, nunca el token en claro.
 *
 * Es HMAC y no SHA-256 pelado a propósito: rotar SESSION_SECRET invalida todas
 * las sesiones activas (docs/06-security.md §8). Un secreto que no participa de
 * ningún cálculo no protege nada.
 */
export function hmac(value: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(value).digest('hex');
}

/** Comparación en tiempo constante de dos strings. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
