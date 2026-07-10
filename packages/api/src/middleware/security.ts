import type { MiddlewareHandler } from 'hono';
import { isProd } from '../env';
import { payloadTooLarge } from '../lib/errors';
import type { AppEnv } from '../types';

const DEFAULT_BODY_LIMIT_BYTES = 16 * 1024;

/** Cabeceras de seguridad en todas las respuestas (ver docs/06-security.md §7). */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // `blob:` habilita el preview local de la foto antes de subirla
      // (URL.createObjectURL). No permite cargar imágenes de terceros.
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "script-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  );
  if (isProd) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  c.res.headers.delete('X-Powered-By');
  await next();
};

/**
 * Evita que el CDN (Railway Edge) cachee respuestas de la API.
 * Los datos van tras cookie de sesión: cachearlos en el borde filtraría datos
 * entre usuarios. `no-store` + `Vary: Cookie` lo previenen.
 *
 * La foto de un vino se exceptúa a mano en su propia ruta.
 */
export const apiCacheControl: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) {
    c.header('Cache-Control', 'no-store, private');
  }
  c.header('Vary', 'Cookie');
};

/**
 * Límite de tamaño de body JSON (anti-payloads abusivos).
 * Los multipart (subida de foto) se saltan este tope: tienen el suyo, mucho más
 * alto, aplicado en la ruta de foto. Sin esta excepción, una foto de 6 MB daría
 * 413 acá antes de llegar al handler.
 */
export function bodyLimit(maxBytes = DEFAULT_BODY_LIMIT_BYTES): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.startsWith('multipart/form-data')) {
      const len = c.req.header('content-length');
      if (len && Number(len) > maxBytes) throw payloadTooLarge('Cuerpo demasiado grande.');
    }
    await next();
  };
}
