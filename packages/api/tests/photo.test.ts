import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WineListItem } from '@bv/shared';
import type { Hono } from 'hono';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/env';
import { wineRepo } from '../src/repositories/wineRepo';
import type { AppEnv } from '../src/types';
import { TestClient, registerAndLogin, testApp } from './helpers';

// Cada corrida usa su propio UPLOAD_DIR temporal, aislado y borrable.
const UPLOAD_DIR = join(tmpdir(), `wow-uploads-${Date.now()}`);

beforeAll(() => {
  env.UPLOAD_DIR = UPLOAD_DIR;
});
afterAll(async () => {
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/**
 * JPEG real con metadata EXIF embebida. El EXIF es donde vive también la
 * geolocalización (GPS IFD); si el re-encode borra el bloque EXIF, borra el GPS.
 */
async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: '#7b2d3b' } })
    .withMetadata({ exif: { IFD0: { Copyright: 'test', Software: 'camara' } } })
    .jpeg()
    .toBuffer();
}

async function pngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 80, height: 80, channels: 4, background: '#30a46c' } })
    .png()
    .toBuffer();
}

/** POST multipart con las dos cookies (sesión + csrf) y el header csrf. */
async function postPhoto(
  app: Hono<AppEnv>,
  client: TestClient,
  wineId: number,
  bytes: Buffer,
  opts: { filename?: string; contentType?: string } = {},
): Promise<Response> {
  await client.get('/api/auth/csrf');
  const form = new FormData();
  form.append(
    'photo',
    new Blob([bytes], { type: opts.contentType ?? 'image/png' }),
    opts.filename ?? 'foto.png',
  );
  return app.request(`/api/wines/${wineId}/photo`, {
    method: 'POST',
    headers: {
      cookie: `bv_session=${client.sessionToken}; bv_csrf=${client.csrfToken}`,
      'x-csrf-token': client.csrfToken,
    },
    body: form,
  });
}

async function makeWine(client: TestClient): Promise<number> {
  const wine = (await (
    await client.post('/api/wines', { name: 'Con Foto', type: 'tinto', grapeNames: [] })
  ).json()) as WineListItem;
  return wine.id;
}

describe('subir foto', () => {
  it('acepta un JPEG, lo guarda como WebP y borra el EXIF (incluida la geolocalización)', async () => {
    const { app, db } = testApp();
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const wineId = await makeWine(client);

    const res = await postPhoto(app, client, wineId, await jpegWithExif(), {
      filename: 'etiqueta.jpg',
      contentType: 'image/jpeg',
    });

    expect(res.status).toBe(200);
    const fileName = wineRepo.findById(db, wineId)?.photoFile;
    expect(fileName?.endsWith('.webp')).toBe(true);

    const saved = await readFile(join(UPLOAD_DIR, fileName ?? ''));
    const meta = await sharp(saved).metadata();
    expect(meta.format).toBe('webp');
    // sharp deja `exif` undefined cuando no hay bloque EXIF en el archivo.
    expect(meta.exif).toBeUndefined();
  });

  it('rechaza un .txt renombrado a .jpg por magic bytes (415)', async () => {
    const { app } = testApp();
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const wineId = await makeWine(client);

    const notAnImage = Buffer.from('esto no es una imagen, es texto plano largo.');
    const res = await postPhoto(app, client, wineId, notAnImage, {
      filename: 'malicioso.jpg',
      contentType: 'image/jpeg',
    });

    expect(res.status).toBe(415);
  });

  it('reemplazar la foto borra el archivo anterior del disco', async () => {
    const { app, db } = testApp();
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const wineId = await makeWine(client);

    await postPhoto(app, client, wineId, await pngBuffer());
    const firstFile = wineRepo.findById(db, wineId)?.photoFile ?? '';

    await postPhoto(app, client, wineId, await jpegWithExif());
    const secondFile = wineRepo.findById(db, wineId)?.photoFile ?? '';

    expect(firstFile).not.toBe('');
    expect(secondFile).not.toBe(firstFile);
    const oldExists = await readFile(join(UPLOAD_DIR, firstFile)).then(
      () => true,
      () => false,
    );
    expect(oldExists).toBe(false);
  });

  it('no deja subir una foto a un vino ajeno (403)', async () => {
    const { app } = testApp();
    const owner = new TestClient(app);
    await registerAndLogin(owner, 'braian');
    const wineId = await makeWine(owner);

    const other = new TestClient(app);
    await registerAndLogin(other, 'sofi');
    const res = await postPhoto(app, other, wineId, await pngBuffer());

    expect(res.status).toBe(403);
  });
});

describe('descargar foto', () => {
  it('sin sesión responde 401', async () => {
    const { app } = testApp();
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const wineId = await makeWine(client);
    await postPhoto(app, client, wineId, await pngBuffer());

    const res = await app.request(`/api/wines/${wineId}/photo`);

    expect(res.status).toBe(401);
  });

  it('con sesión devuelve el WebP con cache privada', async () => {
    const { app } = testApp();
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const wineId = await makeWine(client);
    await postPhoto(app, client, wineId, await pngBuffer());

    const res = await app.request(`/api/wines/${wineId}/photo`, {
      headers: { cookie: `bv_session=${client.sessionToken}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('private');
  });

  it('un photo_file envenenado con path traversal no escapa de UPLOAD_DIR', async () => {
    const { app, db } = testApp();
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const wineId = await makeWine(client);
    // Simulamos una DB comprometida apuntando fuera del directorio de uploads.
    db.prepare('UPDATE wines SET photo_file = ? WHERE id = ?').run(
      '../../../../etc/passwd',
      wineId,
    );

    const res = await app.request(`/api/wines/${wineId}/photo`, {
      headers: { cookie: `bv_session=${client.sessionToken}` },
    });

    // basename() convierte la ruta en "passwd", que no existe en UPLOAD_DIR → 404.
    expect(res.status).toBe(404);
  });
});
