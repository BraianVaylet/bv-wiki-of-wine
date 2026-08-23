import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, renameSync } from 'node:fs';
import { copyFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { extract as tarExtract } from 'tar';
import { env } from '../env';
import { now } from '../lib/time';
import { type BackupManifest, listBackups, manifestFileFor, toStamp } from './backup';

/**
 * Verificación y restauración de un backup.
 *
 * El comando por defecto es **verificar**, no restaurar: comprobar los sha256 no
 * toca nada y es lo que convierte un archivo en un backup de verdad. Restaurar
 * pisa la base viva, así que exige `--yes` explícito.
 *
 * Antes de escribir nada, lo actual se mueve a un lado (`.pre-restore-<stamp>`).
 * Si la restauración sale mal, los datos previos siguen ahí.
 */

const DB_SIDECARS = ['', '-wal', '-shm'] as const;

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

export class BackupIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupIntegrityError';
  }
}

/** Resuelve `latest` o valida que el stamp pedido exista en el directorio. */
export function resolveStamp(dir: string, wanted?: string): string {
  const sets = listBackups(dir);
  const latest = sets[0];
  if (!latest) throw new BackupIntegrityError(`No hay backups en ${dir}.`);
  if (!wanted || wanted === 'latest') return latest.stamp;
  if (!sets.some((s) => s.stamp === wanted)) {
    throw new BackupIntegrityError(`No existe el backup ${wanted} en ${dir}.`);
  }
  return wanted;
}

/**
 * Lee el manifiesto y comprueba que los dos artefactos coincidan byte a byte.
 * Tira `BackupIntegrityError` si algo no cierra. No modifica nada.
 */
export async function verifyBackup(dir: string, stamp: string): Promise<BackupManifest> {
  const manifestPath = join(dir, manifestFileFor(stamp));
  if (!existsSync(manifestPath)) {
    throw new BackupIntegrityError(`Falta el manifiesto ${manifestFileFor(stamp)}.`);
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BackupManifest;
  if (manifest.version !== 1) {
    throw new BackupIntegrityError(`Manifiesto versión ${manifest.version}, esperaba 1.`);
  }

  for (const artifact of [manifest.db, manifest.uploads]) {
    const path = join(dir, artifact.file);
    if (!existsSync(path)) throw new BackupIntegrityError(`Falta ${artifact.file}.`);
    const actual = await sha256(path);
    if (actual !== artifact.sha256) {
      throw new BackupIntegrityError(
        `${artifact.file} está corrupto: sha256 ${actual.slice(0, 12)}… ≠ ${artifact.sha256.slice(0, 12)}… del manifiesto.`,
      );
    }
  }
  return manifest;
}

export interface RestoreOptions {
  backupDir?: string;
  stamp?: string;
  databasePath?: string;
  uploadDir?: string;
}

export interface RestoreResult {
  manifest: BackupManifest;
  /** Sufijo con el que se guardó lo que había antes, por si hay que volver atrás. */
  movedAside: string[];
}

/**
 * Restaura un backup verificado sobre `DATABASE_PATH` y `UPLOAD_DIR`.
 * **La app tiene que estar detenida**: escribir el `.db` bajo los pies de un
 * proceso con la base abierta lo deja leyendo un archivo que ya no existe.
 */
export async function restoreBackup(opts: RestoreOptions = {}): Promise<RestoreResult> {
  const dir = opts.backupDir ?? env.BACKUP_DIR;
  const databasePath = opts.databasePath ?? env.DATABASE_PATH;
  const uploadDir = opts.uploadDir ?? env.UPLOAD_DIR;

  const stamp = resolveStamp(dir, opts.stamp);
  const manifest = await verifyBackup(dir, stamp);
  const aside = `.pre-restore-${toStamp(now())}`;
  const movedAside: string[] = [];

  // 1. Lo actual a un lado. Los sidecars WAL van sí o sí: un `-wal` viejo aplicado
  //    sobre una base nueva la corrompe, y es un error silencioso.
  for (const suffix of DB_SIDECARS) {
    const file = databasePath + suffix;
    if (!existsSync(file)) continue;
    renameSync(file, file + aside);
    movedAside.push(file + aside);
  }
  if (existsSync(uploadDir)) {
    renameSync(uploadDir, uploadDir + aside);
    movedAside.push(uploadDir + aside);
  }

  // 2. La base restaurada.
  mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  await copyFile(join(dir, manifest.db.file), databasePath);

  // 3. Las fotos. `strip: 1` descarta el nombre del directorio que tenía el tar,
  //    así el backup se restaura aunque UPLOAD_DIR se llame distinto ahora.
  mkdirSync(uploadDir, { recursive: true });
  await tarExtract({ file: join(dir, manifest.uploads.file), cwd: resolve(uploadDir), strip: 1 });

  return { manifest, movedAside };
}

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  return {
    stamp: argv.find((a) => !a.startsWith('--')),
    apply: flags.has('--yes'),
    list: flags.has('--list'),
  };
}

async function main(): Promise<void> {
  const { stamp, apply, list } = parseArgs(process.argv.slice(2));
  const dir = env.BACKUP_DIR;

  if (list) {
    const sets = listBackups(dir);
    if (sets.length === 0) {
      console.log(`No hay backups en ${dir}.`);
      return;
    }
    for (const set of sets) {
      console.log(
        `${set.stamp}  ${new Date(set.at).toISOString()}  (${set.files.length} archivos)`,
      );
    }
    return;
  }

  const target = resolveStamp(dir, stamp);
  const manifest = await verifyBackup(dir, target);
  console.log(`✅ Backup ${target} íntegro (sha256 verificado en las dos partes).`);
  console.log(
    `   ${manifest.counts.wines_active} vinos · ${manifest.counts.reviews} reseñas · ${manifest.counts.users} usuarios · ${manifest.uploads.count} fotos`,
  );

  if (!apply) {
    console.log('\nSolo verificación. Para restaurar de verdad:');
    console.log(`   pnpm db:restore ${target} --yes`);
    console.log('   (con la app DETENIDA: se pisa DATABASE_PATH y UPLOAD_DIR)');
    return;
  }

  const { movedAside } = await restoreBackup({ backupDir: dir, stamp: target });
  console.log(`\n✅ Restaurado sobre ${env.DATABASE_PATH} y ${env.UPLOAD_DIR}.`);
  if (movedAside.length > 0) {
    console.log('   Lo anterior quedó guardado en:');
    for (const file of movedAside) console.log(`   · ${file}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('❌ Restore fallido:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
