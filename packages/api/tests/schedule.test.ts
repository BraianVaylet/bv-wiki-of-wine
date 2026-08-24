import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listBackups } from '../src/db/backup';
import type { DB } from '../src/db/connection';
import { runScheduledBackup } from '../src/db/schedule';
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
