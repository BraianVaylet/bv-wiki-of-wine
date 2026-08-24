import { mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listBackups, toStamp } from '../src/db/backup';
import type { DB } from '../src/db/connection';
import { backupIsDue, runScheduledBackup } from '../src/db/schedule';
import { env } from '../src/env';
import { testDb } from './helpers';

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `wow-sched-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, 'uploads'), { recursive: true });
  env.BACKUP_DIR = join(root, 'backups');
  env.UPLOAD_DIR = join(root, 'uploads');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

/** Una base con al menos un usuario: el scheduler la considera "viva". */
function liveDb(): DB {
  const db = testDb();
  db.exec(`
    INSERT INTO users (alias, password_hash, security_question_id, security_answer_hash, created_at)
      VALUES ('braian', 'hash', 3, 'hash', 1000);
  `);
  return db;
}

describe('backupIsDue', () => {
  const HOUR = 3_600_000;
  const nowMs = Date.parse('2026-08-24T22:00:00.000Z');

  /** Deja un set con fecha arbitraria, sin correr un backup real. */
  function backupAt(hoursAgo: number): void {
    mkdirSync(env.BACKUP_DIR, { recursive: true });
    const stamp = toStamp(nowMs - hoursAgo * HOUR);
    for (const suffix of ['.db', '.uploads.tar.gz', '.manifest.json']) {
      writeFileSync(join(env.BACKUP_DIR, `wow-${stamp}${suffix}`), 'x');
    }
  }

  it('toca si nunca hubo backup', () => {
    expect(backupIsDue(env.BACKUP_DIR, 24, nowMs)).toBe(true);
  });

  it('toca si el último es más viejo que el intervalo', () => {
    backupAt(30);
    expect(backupIsDue(env.BACKUP_DIR, 24, nowMs)).toBe(true);
  });

  it('NO toca si el último es reciente', () => {
    // Con App Sleeping el proceso arranca cada vez que alguien entra a la app.
    // Sin esta guarda, diez visitas en una tarde serían diez backups.
    backupAt(2);
    expect(backupIsDue(env.BACKUP_DIR, 24, nowMs)).toBe(false);
  });

  it('toca justo al cumplirse el intervalo', () => {
    backupAt(24);
    expect(backupIsDue(env.BACKUP_DIR, 24, nowMs)).toBe(true);
  });
});

describe('runScheduledBackup', () => {
  it('genera el backup cuando la base tiene datos', async () => {
    const ok = await runScheduledBackup(liveDb());

    expect(ok).toBe(true);
    expect(listBackups(env.BACKUP_DIR)).toHaveLength(1);
  });

  it('NO hace backup si la base no tiene usuarios', async () => {
    // El escenario real: el volumen se desmontó y la app arrancó con una base
    // vacía. Subir eso empujaría los backups buenos fuera de la retención.
    const ok = await runScheduledBackup(testDb());

    expect(ok).toBe(false);
    expect(listBackups(env.BACKUP_DIR)).toHaveLength(0);
  });

  it('avisa por consola de error cuando saltea por base vacía', async () => {
    await runScheduledBackup(testDb());

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('volumen'));
  });

  it('no propaga el error si el backup falla', async () => {
    const db = liveDb();
    vi.spyOn(db, 'backup').mockRejectedValue(new Error('disco lleno'));

    await expect(runScheduledBackup(db)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Backup programado fallido'),
      'disco lleno',
    );
  });

  it('libera el lock después de fallar, para que el próximo ciclo lo intente', async () => {
    const db = liveDb();
    const spy = vi.spyOn(db, 'backup').mockRejectedValueOnce(new Error('transitorio'));

    expect(await runScheduledBackup(db)).toBe(false);
    spy.mockRestore();
    expect(await runScheduledBackup(db)).toBe(true);
  });

  it('saltea el ciclo si ya hay uno corriendo', async () => {
    const db = liveDb();
    let release: () => void = () => {};
    const blocked = new Promise<void>((ok) => {
      release = ok;
    });
    vi.spyOn(db, 'backup').mockImplementation(async () => {
      await blocked;
      return { totalPages: 0, remainingPages: 0 };
    });

    const first = runScheduledBackup(db);
    const second = await runScheduledBackup(db);

    expect(second).toBe(false);
    release();
    await first;
  });
});
