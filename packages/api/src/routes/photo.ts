import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { env } from '../env';
import { notFound, payloadTooLarge, validationError } from '../lib/errors';
import { wineImagePath } from '../lib/images';
import { hmac } from '../lib/tokens';
import { requireCsrf } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { parseId } from '../middleware/validate';
import type { Services } from '../services';
import type { AppEnv } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ONE_YEAR_SECONDS = 31_536_000;

/**
 * Rutas de foto de vino. Separadas del router principal por dos motivos:
 * son multipart (no JSON) y llevan su propio rate limit de subida.
 */
export function photoRoutes(services: Services) {
  const r = new Hono<AppEnv>();

  // Límite dedicado de subida: existe porque el registro es abierto y cualquiera
  // podría inundar el volumen (docs/06-security.md §2).
  const uploadLimit = rateLimit({
    windowMs: MS_PER_DAY,
    max: env.UPLOAD_RATE_LIMIT_MAX,
    prefix: 'upload',
    by: 'actor',
  });

  r.post('/:id/photo', requireCsrf, uploadLimit, async (c) => {
    const id = parseId(c.req.param('id'));

    // Rechazar por tamaño ANTES de leer el body entero en memoria.
    const declaredLength = Number(c.req.header('content-length') ?? 0);
    if (declaredLength > env.MAX_UPLOAD_BYTES) {
      throw payloadTooLarge('La imagen supera el tamaño máximo.');
    }

    const form = await c.req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) throw validationError('Falta el archivo (campo "photo").');

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await services.wines.setPhoto(id, bytes, c.get('actor'));
    return c.json(result);
  });

  r.delete('/:id/photo', requireCsrf, async (c) => {
    const id = parseId(c.req.param('id'));
    await services.wines.removePhoto(id, c.get('actor'));
    return c.body(null, 204);
  });

  // Descarga: requiere sesión (RN-1). Es la ÚNICA excepción al no-store, y es
  // segura porque va con `private` y una URL con UUID irrepetible.
  r.get('/:id/photo', async (c) => {
    const id = parseId(c.req.param('id'));
    const fileName = services.wines.getPhotoFile(id);

    // ETag = hash del nombre: un cambio de foto cambia el UUID y el ETag.
    const etag = `"${hmac(fileName).slice(0, 16)}"`;
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);

    // `wineImagePath` aplica basename(): aunque la DB estuviera envenenada con
    // "../../etc/passwd", la lectura no escapa de UPLOAD_DIR.
    const bytes = await readFile(wineImagePath(fileName)).catch(() => null);
    if (!bytes) throw notFound('La foto no está disponible.');

    c.header('Content-Type', 'image/webp');
    c.header('ETag', etag);
    c.header('Cache-Control', `private, max-age=${ONE_YEAR_SECONDS}, immutable`);
    return c.body(bytes);
  });

  return r;
}
