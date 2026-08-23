import { createHash, createHmac } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../env';
import type { BackupManifest } from './backup';

/**
 * Subida del set de backup a un bucket S3-compatible (Backblaze B2, R2, S3…).
 *
 * Firma SigV4 a mano en vez de `@aws-sdk/client-s3`: el SDK son decenas de MB de
 * dependencias para un único `PUT`. Acá son dos HMAC encadenados y un string bien
 * armado, sin nada que actualizar.
 *
 * La key nunca borra nada. La retención remota se configura con Lifecycle Rules
 * del bucket, para que un contenedor comprometido no pueda vaciar los backups.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';
/** Sin multipart, el cuerpo entra en memoria. De sobra para un `.db` + fotos. */
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

export interface S3Config {
  /** Host del endpoint, con o sin esquema. Ej. `s3.us-west-004.backblazeb2.com`. */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) =>
  createHmac('sha256', key).update(data, 'utf8').digest();

/**
 * Percent-encoding de RFC 3986, que es lo que pide SigV4.
 * `encodeURIComponent` deja pasar `!'()*` sin escapar, y con eso la firma no cierra.
 */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = '';
  for (const byte of Buffer.from(value, 'utf8')) {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(char)) out += char;
    else if (char === '/' && !encodeSlash) out += char;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export interface SignParams {
  method: string;
  host: string;
  /** Path canónico, ya URI-encodeado salvo las barras. */
  path: string;
  headers: Record<string, string>;
  payloadSha256: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
}

/**
 * Devuelve los headers a mandar, incluido `Authorization`.
 * Firma exactamente los headers que recibe más `host`, `x-amz-date` y
 * `x-amz-content-sha256`: si mandás uno que no firmaste, o firmás uno que no
 * mandás, el server responde 403 sin explicar cuál de los dos fue.
 */
export function signV4(params: SignParams): Record<string, string> {
  const amzDate = params.date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${params.region}/${SERVICE}/aws4_request`;

  const headers: Record<string, string> = {
    ...params.headers,
    host: params.host,
    'x-amz-content-sha256': params.payloadSha256,
    'x-amz-date': amzDate,
  };

  // Canónico = nombres en minúscula, ordenados, valores con espacios colapsados.
  const canonicalNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const canonicalHeaders = canonicalNames
    .map((name) => `${name}:${(lower.get(name) ?? '').trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const signedHeaders = canonicalNames.join(';');

  const canonicalRequest = [
    params.method,
    params.path,
    '',
    canonicalHeaders,
    signedHeaders,
    params.payloadSha256,
  ].join('\n');

  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${params.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, params.region);
  const kService = hmac(kRegion, SERVICE);
  const signature = hmac(hmac(kService, 'aws4_request'), stringToSign).toString('hex');

  return {
    ...headers,
    authorization: `${ALGORITHM} Credential=${params.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** `null` si no hay bucket configurado: el backup remoto es opcional, no un error. */
export function s3ConfigFromEnv(): S3Config | null {
  if (!env.BACKUP_S3_ENDPOINT || !env.BACKUP_S3_BUCKET) return null;
  return {
    endpoint: env.BACKUP_S3_ENDPOINT,
    region: env.BACKUP_S3_REGION,
    bucket: env.BACKUP_S3_BUCKET,
    accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
    prefix: env.BACKUP_S3_PREFIX,
  };
}

export class RemoteUploadError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'RemoteUploadError';
  }
}

/**
 * `PUT` de un objeto. Path-style (`/bucket/key`): B2 y R2 lo soportan, y evita
 * depender de DNS por bucket.
 *
 * `payloadSha256` se puede pasar ya calculado — el manifiesto ya lo tiene para el
 * `.db` y el tar, así que no se leen dos veces para hashear.
 */
export async function putObject(
  cfg: S3Config,
  key: string,
  body: Buffer,
  payloadSha256 = sha256Hex(body),
): Promise<string> {
  const base = cfg.endpoint.includes('://') ? cfg.endpoint : `https://${cfg.endpoint}`;
  const { host, protocol } = new URL(base);
  const path = `/${uriEncode(cfg.bucket)}/${uriEncode(key, false)}`;

  const headers = signV4({
    method: 'PUT',
    host,
    path,
    headers: { 'content-type': 'application/octet-stream' },
    payloadSha256,
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    date: new Date(),
  });

  const res = await fetch(`${protocol}//${host}${path}`, { method: 'PUT', headers, body });
  if (!res.ok) {
    // Los errores de S3 vienen en XML con el motivo real adentro; sin esto el
    // diagnóstico se queda en "403" y no se sabe si es la firma, la key o el bucket.
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    throw new RemoteUploadError(
      `PUT ${key} → ${res.status} ${res.statusText}. ${detail}`,
      res.status,
    );
  }
  return key;
}

/** Sube los tres archivos del set. Devuelve las keys remotas creadas. */
export async function uploadBackupSet(
  cfg: S3Config,
  dir: string,
  manifest: BackupManifest,
): Promise<string[]> {
  const manifestName = `wow-${manifest.stamp}.manifest.json`;
  const parts: { file: string; sha256?: string }[] = [
    { file: manifest.db.file, sha256: manifest.db.sha256 },
    { file: manifest.uploads.file, sha256: manifest.uploads.sha256 },
    { file: manifestName },
  ];

  const keys: string[] = [];
  for (const part of parts) {
    const path = join(dir, part.file);
    const { size } = await stat(path);
    if (size > MAX_UPLOAD_BYTES) {
      throw new RemoteUploadError(
        `${part.file} pesa ${(size / 1024 / 1024).toFixed(0)} MB y el uploader no hace multipart (tope ${MAX_UPLOAD_BYTES / 1024 / 1024} MB). Bajá BACKUP_RETENTION_DAYS o pasá las fotos a object storage.`,
      );
    }
    const body = await readFile(path);
    keys.push(await putObject(cfg, `${cfg.prefix}/${part.file}`, body, part.sha256));
  }
  return keys;
}
