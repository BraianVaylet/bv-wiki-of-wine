import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { env } from '../env';
import { payloadTooLarge, unsupportedMediaType } from './errors';

/** Lado máximo de la imagen guardada. Suficiente para una etiqueta en mobile. */
const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 80;
/** Corta PNGs "bomba" que se expandirían a decenas de GB al decodificar. */
const MAX_INPUT_PIXELS = 100_000_000;

/**
 * Firmas (magic bytes) de los formatos aceptados. El Content-Type y la extensión
 * del cliente MIENTEN: un .php renombrado a .jpg pasa cualquier chequeo por
 * extensión. Se leen los primeros bytes del archivo.
 */
function sniffFormat(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  // "RIFF"...."WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

/** Asegura el directorio de uploads (idempotente). */
async function ensureUploadDir(): Promise<void> {
  await mkdir(env.UPLOAD_DIR, { recursive: true });
}

/**
 * Valida, re-codifica a WebP y guarda una imagen. Devuelve el nombre de archivo
 * generado (uuid.webp). El nombre lo genera el server: nada del cliente toca la
 * ruta del filesystem.
 *
 * Re-codificar NO es opcional: es la defensa principal. Un archivo que sharp
 * decodifica y vuelve a codificar deja de ser un polyglot, pierde el EXIF
 * (incluida la geolocalización) y no puede llevar payload.
 */
export async function saveWineImage(bytes: Buffer): Promise<string> {
  if (bytes.byteLength > env.MAX_UPLOAD_BYTES) {
    throw payloadTooLarge('La imagen supera el tamaño máximo.');
  }
  if (sniffFormat(bytes) === null) {
    throw unsupportedMediaType('Solo se aceptan imágenes JPEG, PNG o WebP.');
  }

  let webp: Buffer;
  try {
    webp = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'truncated' })
      .rotate() // respeta la orientación EXIF antes de descartarla
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    // sharp falla ante una imagen corrupta o una bomba de descompresión.
    throw unsupportedMediaType('No se pudo procesar la imagen.');
  }

  await ensureUploadDir();
  const fileName = `${randomUUID()}.webp`;
  await writeFile(join(env.UPLOAD_DIR, fileName), webp);
  return fileName;
}

/** Ruta absoluta de una foto. `basename` es el cinturón anti path-traversal. */
export function wineImagePath(fileName: string): string {
  return join(env.UPLOAD_DIR, basename(fileName));
}

/** Borra una foto. Best-effort: un archivo huérfano no debe romper la request. */
export async function deleteWineImage(fileName: string): Promise<void> {
  try {
    await unlink(wineImagePath(fileName));
  } catch {
    // Ya no estaba, o el disco falló: se loguea arriba si importa.
  }
}
