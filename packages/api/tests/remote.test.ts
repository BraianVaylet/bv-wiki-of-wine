import { mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { type IncomingMessage, type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runBackup } from '../src/db/backup';
import {
  RemoteUploadError,
  type S3Config,
  putObject,
  signV4,
  uploadBackupSet,
  uriEncode,
} from '../src/db/remote';
import { testDb } from './helpers';

interface Captured {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

let server: Server;
let received: Captured[] = [];
let status = 200;
let responseBody = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      received.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      res.writeHead(status);
      res.end(responseBody);
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
});

afterAll(async () => {
  await new Promise<void>((ok) => server.close(() => ok()));
});

beforeEach(() => {
  received = [];
  status = 200;
  responseBody = '';
});

function config(): S3Config {
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    region: 'us-west-004',
    bucket: 'bv-wow-backups',
    accessKeyId: 'keyID-de-prueba',
    secretAccessKey: 'applicationKey-de-prueba',
    prefix: 'wow',
  };
}

describe('signV4', () => {
  /**
   * Vector oficial de AWS para SigV4 (GET Object con Range, us-east-1).
   * Es la única forma de saber que la firma está bien sin re-implementarla en el
   * test: si el algoritmo se desvía en un byte, esta firma deja de coincidir.
   */
  it('reproduce la firma del vector oficial de AWS', () => {
    const headers = signV4({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { range: 'bytes=0-9' },
      payloadSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      date: new Date('2013-05-24T00:00:00.000Z'),
    });

    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
  });

  it('cambia la firma si cambia un solo byte del payload', () => {
    const base = {
      method: 'PUT',
      host: 'ejemplo.com',
      path: '/b/k',
      headers: {},
      region: 'us-east-1',
      accessKeyId: 'AKID',
      secretAccessKey: 'SECRET',
      date: new Date('2026-08-23T00:00:00.000Z'),
    };
    const a = signV4({ ...base, payloadSha256: 'a'.repeat(64) });
    const b = signV4({ ...base, payloadSha256: `${'a'.repeat(63)}b` });

    expect(a.authorization).not.toBe(b.authorization);
  });
});

describe('uriEncode', () => {
  it('escapa lo que encodeURIComponent deja pasar', () => {
    expect(uriEncode("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af');
  });

  it('respeta las barras cuando se le pide', () => {
    expect(uriEncode('wow/archivo.db', false)).toBe('wow/archivo.db');
    expect(uriEncode('wow/archivo.db')).toBe('wow%2Farchivo.db');
  });

  it('codifica multibyte por byte UTF-8, no por code unit', () => {
    expect(uriEncode('ñ')).toBe('%C3%B1');
  });
});

describe('putObject', () => {
  it('manda un PUT path-style con el cuerpo y la firma', async () => {
    const cfg = config();
    const body = Buffer.from('contenido del backup');

    await putObject(cfg, 'wow/wow-x.db', body);

    expect(received).toHaveLength(1);
    const req = received[0] as Captured;
    expect(req.method).toBe('PUT');
    expect(req.url).toBe('/bv-wow-backups/wow/wow-x.db');
    expect(req.body).toEqual(body);
    expect(req.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=keyID-de-prueba\/\d{8}\/us-west-004\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
    );
  });

  it('manda el sha256 del cuerpo en x-amz-content-sha256', async () => {
    // El servidor lo usa para validar integridad: si miente, el PUT se rechaza.
    await putObject(config(), 'wow/vacio.db', Buffer.alloc(0));

    expect((received[0] as Captured).headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('acepta un sha256 ya calculado sin re-hashear', async () => {
    const precomputed = 'f'.repeat(64);
    await putObject(config(), 'wow/x.db', Buffer.from('hola'), precomputed);

    expect((received[0] as Captured).headers['x-amz-content-sha256']).toBe(precomputed);
  });

  it('incluye el XML de error de S3 en el mensaje, no solo el status', async () => {
    status = 403;
    responseBody = '<Error><Code>SignatureDoesNotMatch</Code></Error>';

    await expect(putObject(config(), 'wow/x.db', Buffer.from('x'))).rejects.toThrow(
      /403.*SignatureDoesNotMatch/s,
    );
  });

  it('expone el status en el error para poder distinguir 403 de 404', async () => {
    status = 404;
    const err = await putObject(config(), 'wow/x.db', Buffer.from('x')).catch((e) => e);

    expect(err).toBeInstanceOf(RemoteUploadError);
    expect((err as RemoteUploadError).status).toBe(404);
  });
});

describe('uploadBackupSet', () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `wow-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(root, 'uploads'), { recursive: true });
    writeFileSync(join(root, 'uploads', 'etiqueta.webp'), 'bytes');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('sube los tres archivos del set bajo el prefijo', async () => {
    const backupDir = join(root, 'backups');
    const { manifest } = await runBackup({
      db: testDb(),
      backupDir,
      uploadDir: join(root, 'uploads'),
    });

    const keys = await uploadBackupSet(config(), backupDir, manifest);

    expect(keys).toEqual([
      `wow/${manifest.db.file}`,
      `wow/${manifest.uploads.file}`,
      `wow/wow-${manifest.stamp}.manifest.json`,
    ]);
    expect(received.map((r) => r.url)).toEqual(keys.map((k) => `/bv-wow-backups/${k}`));
  });

  it('sube el .db con el sha256 que ya calculó el manifiesto', async () => {
    const backupDir = join(root, 'backups');
    const { manifest } = await runBackup({
      db: testDb(),
      backupDir,
      uploadDir: join(root, 'uploads'),
    });

    await uploadBackupSet(config(), backupDir, manifest);

    expect((received[0] as Captured).headers['x-amz-content-sha256']).toBe(manifest.db.sha256);
  });
});
