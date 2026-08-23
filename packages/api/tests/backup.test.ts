import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type BackupManifest,
  listBackups,
  manifestFileFor,
  pruneBackups,
  runBackup,
  toStamp,
} from '../src/db/backup';
import { createDb } from '../src/db/connection';
import { BackupIntegrityError, restoreBackup, verifyBackup } from '../src/db/restore';
import { testDb } from './helpers';

const PHOTO = 'etiqueta.webp';
const PHOTO_BYTES = Buffer.from('no es un webp de verdad, pero son bytes estables');

let root: string;
let backupDir: string;
let uploadDir: string;

beforeEach(() => {
  root = join(tmpdir(), `wow-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  backupDir = join(root, 'backups');
  uploadDir = join(root, 'uploads');
  mkdirSync(uploadDir, { recursive: true });
  writeFileSync(join(uploadDir, PHOTO), PHOTO_BYTES);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Base con un vino reseñado: lo mínimo para notar si una restauración perdió algo. */
function seededDb() {
  const db = testDb();
  db.exec(`
    INSERT INTO users (alias, password_hash, security_question_id, security_answer_hash, created_at)
      VALUES ('braian', 'hash', 3, 'hash', 1000);
    INSERT INTO wineries (name, created_at) VALUES ('Catena Zapata', 1000);
    INSERT INTO wines (name, winery_id, type, vintage, photo_file, created_at, updated_at)
      VALUES ('Malbec Argentino', 1, 'tinto', 2019, '${PHOTO}', 1000, 1000);
    INSERT INTO reviews (wine_id, user_id, overall, notes, created_at, updated_at)
      VALUES (1, 1, 5, 'Redondo.', 1000, 1000);
  `);
  return db;
}

describe('runBackup', () => {
  it('escribe el set completo y refleja el contenido en el manifiesto', async () => {
    const { manifest, dir } = await runBackup({ db: seededDb(), backupDir, uploadDir });

    expect(existsSync(join(dir, manifest.db.file))).toBe(true);
    expect(existsSync(join(dir, manifest.uploads.file))).toBe(true);
    expect(existsSync(join(dir, manifestFileFor(manifest.stamp)))).toBe(true);

    expect(manifest.counts).toMatchObject({ wines: 1, wines_active: 1, reviews: 1, users: 1 });
    expect(manifest.uploads.count).toBe(1);
    expect(manifest.db.bytes).toBeGreaterThan(0);
    expect(manifest.db.sha256).toHaveLength(64);
  });

  it('el .db del backup es una base válida y consistente, no un archivo a medias', async () => {
    const { manifest, dir } = await runBackup({ db: seededDb(), backupDir, uploadDir });

    const restored = createDb(join(dir, manifest.db.file));
    const row = restored.prepare('SELECT name, vintage FROM wines WHERE id = 1').get() as {
      name: string;
      vintage: number;
    };
    expect(row).toEqual({ name: 'Malbec Argentino', vintage: 2019 });
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    restored.close();
  });

  it('deja los backups listables y ordenados del más nuevo al más viejo', async () => {
    const first = await runBackup({ db: seededDb(), backupDir, uploadDir });
    const second = await runBackup({ db: seededDb(), backupDir, uploadDir });

    expect(listBackups(backupDir).map((s) => s.stamp)).toEqual([
      second.manifest.stamp,
      first.manifest.stamp,
    ]);
  });
});

describe('verifyBackup', () => {
  it('acepta un backup intacto', async () => {
    const { manifest } = await runBackup({ db: seededDb(), backupDir, uploadDir });
    await expect(verifyBackup(backupDir, manifest.stamp)).resolves.toMatchObject({
      stamp: manifest.stamp,
    });
  });

  it('detecta un .db corrupto por sha256', async () => {
    const { manifest } = await runBackup({ db: seededDb(), backupDir, uploadDir });
    await appendFile(join(backupDir, manifest.db.file), 'basura');

    await expect(verifyBackup(backupDir, manifest.stamp)).rejects.toBeInstanceOf(
      BackupIntegrityError,
    );
  });

  it('detecta el tar de fotos corrupto', async () => {
    const { manifest } = await runBackup({ db: seededDb(), backupDir, uploadDir });
    await appendFile(join(backupDir, manifest.uploads.file), 'basura');

    await expect(verifyBackup(backupDir, manifest.stamp)).rejects.toBeInstanceOf(
      BackupIntegrityError,
    );
  });

  it('rechaza un manifiesto de versión desconocida', async () => {
    const { manifest } = await runBackup({ db: seededDb(), backupDir, uploadDir });
    const path = join(backupDir, manifestFileFor(manifest.stamp));
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as BackupManifest;
    writeFileSync(path, JSON.stringify({ ...parsed, version: 99 }));

    await expect(verifyBackup(backupDir, manifest.stamp)).rejects.toThrow(/versión 99/);
  });
});

describe('restoreBackup', () => {
  it('devuelve la base y las fotos a un destino vacío', async () => {
    const { manifest } = await runBackup({ db: seededDb(), backupDir, uploadDir });

    const targetDb = join(root, 'restored', 'wow.db');
    const targetUploads = join(root, 'restored', 'uploads');
    await restoreBackup({ backupDir, databasePath: targetDb, uploadDir: targetUploads });

    const db = createDb(targetDb);
    const wine = db.prepare('SELECT name FROM wines WHERE id = 1').get() as { name: string };
    expect(wine.name).toBe('Malbec Argentino');
    expect(db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 1 });
    db.close();

    // La foto es la mitad del backup: un .db restaurado sin etiquetas no sirve.
    expect(readFileSync(join(targetUploads, PHOTO))).toEqual(PHOTO_BYTES);
    expect(manifest.uploads.count).toBe(1);
  });

  it('guarda lo que había antes en vez de pisarlo', async () => {
    const { manifest } = await runBackup({ db: seededDb(), backupDir, uploadDir });

    const targetDb = join(root, 'live', 'wow.db');
    mkdirSync(join(root, 'live'), { recursive: true });
    writeFileSync(targetDb, 'base anterior');

    const { movedAside } = await restoreBackup({
      backupDir,
      stamp: manifest.stamp,
      databasePath: targetDb,
      uploadDir: join(root, 'live', 'uploads'),
    });

    const saved = movedAside.find((f) => f.startsWith(targetDb));
    expect(saved).toBeDefined();
    expect(readFileSync(saved as string, 'utf8')).toBe('base anterior');
    expect(readFileSync(targetDb).length).toBeGreaterThan('base anterior'.length);
  });

  it('falla antes de tocar nada si el backup está corrupto', async () => {
    const { manifest } = await runBackup({ db: seededDb(), backupDir, uploadDir });
    await appendFile(join(backupDir, manifest.db.file), 'basura');

    const targetDb = join(root, 'live', 'wow.db');
    mkdirSync(join(root, 'live'), { recursive: true });
    writeFileSync(targetDb, 'base anterior');

    await expect(
      restoreBackup({ backupDir, databasePath: targetDb, uploadDir: join(root, 'live', 'up') }),
    ).rejects.toBeInstanceOf(BackupIntegrityError);
    expect(readFileSync(targetDb, 'utf8')).toBe('base anterior');
  });

  it('avisa cuando no hay ningún backup', async () => {
    mkdirSync(backupDir, { recursive: true });
    await expect(restoreBackup({ backupDir, databasePath: join(root, 'x.db') })).rejects.toThrow(
      /No hay backups/,
    );
  });
});

describe('pruneBackups', () => {
  const DAY = 86_400_000;
  const nowMs = Date.parse('2026-08-23T12:00:00.000Z');

  /** Crea los tres archivos de un set con fecha arbitraria, sin correr un backup. */
  function fakeSet(daysAgo: number): string {
    mkdirSync(backupDir, { recursive: true });
    const stamp = toStamp(nowMs - daysAgo * DAY);
    for (const suffix of ['.db', '.uploads.tar.gz', '.manifest.json']) {
      writeFileSync(join(backupDir, `wow-${stamp}${suffix}`), 'x');
    }
    return stamp;
  }

  it('borra los sets más viejos que la retención', () => {
    const old = fakeSet(60);
    const recent = fakeSet(2);

    const pruned = pruneBackups(backupDir, 30, nowMs);

    expect(pruned).toHaveLength(3);
    expect(pruned.every((f) => f.includes(old))).toBe(true);
    expect(listBackups(backupDir).map((s) => s.stamp)).toEqual([recent]);
  });

  it('nunca borra el más reciente, por viejo que sea', () => {
    const onlyOne = fakeSet(400);

    expect(pruneBackups(backupDir, 30, nowMs)).toEqual([]);
    expect(listBackups(backupDir).map((s) => s.stamp)).toEqual([onlyOne]);
  });

  it('con retención 0 no borra nada', () => {
    fakeSet(60);
    fakeSet(2);

    expect(pruneBackups(backupDir, 0, nowMs)).toEqual([]);
    expect(listBackups(backupDir)).toHaveLength(2);
  });

  it('ignora archivos ajenos al esquema de nombres', () => {
    fakeSet(60);
    fakeSet(2);
    writeFileSync(join(backupDir, 'notas.txt'), 'x');

    pruneBackups(backupDir, 30, nowMs);

    expect(existsSync(join(backupDir, 'notas.txt'))).toBe(true);
  });
});
