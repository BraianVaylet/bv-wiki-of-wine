import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { create as tarCreate } from 'tar';
import { env } from '../env';
import { now } from '../lib/time';
import { type DB, getDb } from './connection';
import { s3ConfigFromEnv, uploadBackupSet } from './remote';

/**
 * Backup consistente de la wiki: el `.db` + las fotos, siempre juntos.
 *
 * Dos reglas que definen todo el archivo:
 *
 * 1. **Nunca `cp` del `.db`.** Con `journal_mode = WAL` una copia cruda agarra el
 *    archivo principal sin el `-wal` que tiene las escrituras recientes: el backup
 *    sale a medio aplicar y no lo descubrís hasta que lo querés restaurar. Se usa
 *    `db.backup()`, la API de backup online de SQLite, que es consistente aunque
 *    haya escrituras en curso.
 * 2. **El `.db` sin `uploads/` es una wiki de vinos sin etiquetas.** Si el tar de
 *    las fotos falla, se borra también el `.db` recién hecho: un backup a medias
 *    es peor que ninguno, porque genera confianza falsa.
 *
 * ⚠️ Esto NO te salva de perder el volumen. `BACKUP_DIR` por defecto vive en el
 * mismo disco que la base; protege contra un borrado accidental o un bug, no
 * contra que Railway se lleve el volumen puesto. Para eso hay que subir el set a
 * un bucket fuera de Railway — ver docs/08-hosting.md §5.
 */

/** Prefijo de todos los artefactos, para poder barrer el directorio sin ambigüedad. */
const PREFIX = 'wow-';
const MS_PER_DAY = 86_400_000;

/** `2026-08-23T14-05-09-123Z` — ISO con `:` y `.` reemplazados: Windows no los admite en nombres. */
const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;
const FILE_RE = new RegExp(`^${PREFIX}(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z)\\.`);

export interface BackupArtifact {
  file: string;
  bytes: number;
  sha256: string;
}

export interface BackupManifest {
  /** Versión del formato del manifiesto. Si cambia la estructura, restore lo rechaza. */
  version: 1;
  stamp: string;
  createdAt: number;
  db: BackupArtifact;
  uploads: BackupArtifact & { count: number };
  /** Conteos al momento del backup: sirven para saber, de un vistazo, si restauraste lo que creías. */
  counts: Record<string, number>;
}

export interface BackupResult {
  manifest: BackupManifest;
  dir: string;
  pruned: string[];
}

export function toStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

/** Inversa de `toStamp`. `null` si el string no es un stamp nuestro. */
export function fromStamp(stamp: string): number | null {
  const m = STAMP_RE.exec(stamp);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`);
  return Number.isNaN(ms) ? null : ms;
}

export const dbFileFor = (stamp: string) => `${PREFIX}${stamp}.db`;
export const uploadsFileFor = (stamp: string) => `${PREFIX}${stamp}.uploads.tar.gz`;
export const manifestFileFor = (stamp: string) => `${PREFIX}${stamp}.manifest.json`;

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** Cuenta filas de las tablas que le importan a un humano mirando un manifiesto. */
function tableCounts(db: DB): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of ['users', 'wineries', 'grapes', 'wines', 'reviews']) {
    // El nombre de tabla no puede ir parametrizado en SQL, por eso viene de esta
    // lista literal y nunca de input. La regla de "ningún valor por concatenación"
    // sigue intacta: acá no hay ningún valor.
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    counts[table] = row.n;
  }
  counts.wines_active = (
    db.prepare('SELECT COUNT(*) AS n FROM wines WHERE deleted_at IS NULL').get() as { n: number }
  ).n;
  return counts;
}

/** Archivos regulares de `uploads/`, ya filtrados de subdirectorios y basura. */
function uploadCount(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).length;
}

/** Agrupa el contenido de `BACKUP_DIR` por stamp. Ignora todo lo que no sea nuestro. */
export function listBackups(dir: string): { stamp: string; at: number; files: string[] }[] {
  if (!existsSync(dir)) return [];
  const byStamp = new Map<string, string[]>();
  for (const name of readdirSync(dir)) {
    const stamp = FILE_RE.exec(name)?.[1];
    if (!stamp || fromStamp(stamp) === null) continue;
    const files = byStamp.get(stamp);
    if (files) files.push(name);
    else byStamp.set(stamp, [name]);
  }
  return [...byStamp.entries()]
    .map(([stamp, files]) => ({ stamp, at: fromStamp(stamp) as number, files }))
    .sort((a, b) => b.at - a.at);
}

/**
 * Borra los sets más viejos que `retentionDays`.
 * **Nunca borra el más reciente**, por viejo que sea: quedarse sin ningún backup
 * porque hace dos meses que no corre es exactamente el escenario a evitar.
 */
export function pruneBackups(dir: string, retentionDays: number, nowMs = now()): string[] {
  const sets = listBackups(dir);
  if (sets.length <= 1 || retentionDays <= 0) return [];
  const cutoff = nowMs - retentionDays * MS_PER_DAY;
  const removed: string[] = [];
  for (const set of sets.slice(1)) {
    if (set.at >= cutoff) continue;
    for (const file of set.files) {
      rmSync(join(dir, file), { force: true });
      removed.push(file);
    }
  }
  return removed;
}

export interface BackupOptions {
  db?: DB;
  backupDir?: string;
  uploadDir?: string;
  retentionDays?: number;
}

/** Corre un backup completo. Tira si algo falla, sin dejar artefactos a medias. */
export async function runBackup(opts: BackupOptions = {}): Promise<BackupResult> {
  const db = opts.db ?? getDb();
  const dir = opts.backupDir ?? env.BACKUP_DIR;
  const uploadDir = opts.uploadDir ?? env.UPLOAD_DIR;
  const retentionDays = opts.retentionDays ?? env.BACKUP_RETENTION_DAYS;

  mkdirSync(dir, { recursive: true });
  // El tar se arma desde el padre para que adentro quede `uploads/foto.webp` y no
  // una ruta absoluta de esta máquina.
  mkdirSync(uploadDir, { recursive: true });

  const createdAt = now();
  const stamp = toStamp(createdAt);
  const dbPath = join(dir, dbFileFor(stamp));
  const uploadsPath = join(dir, uploadsFileFor(stamp));
  const manifestPath = join(dir, manifestFileFor(stamp));
  const written: string[] = [];

  try {
    await db.backup(dbPath);
    written.push(dbPath);

    await tarCreate({ gzip: true, file: uploadsPath, cwd: dirname(resolve(uploadDir)) }, [
      basename(resolve(uploadDir)),
    ]);
    written.push(uploadsPath);

    const manifest: BackupManifest = {
      version: 1,
      stamp,
      createdAt,
      db: { file: basename(dbPath), bytes: statSync(dbPath).size, sha256: await sha256(dbPath) },
      uploads: {
        file: basename(uploadsPath),
        bytes: statSync(uploadsPath).size,
        sha256: await sha256(uploadsPath),
        count: uploadCount(uploadDir),
      },
      counts: tableCounts(db),
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    written.push(manifestPath);

    return { manifest, dir, pruned: pruneBackups(dir, retentionDays, createdAt) };
  } catch (err) {
    // Un set incompleto es una trampa: parece un backup y no lo es.
    for (const file of written) rmSync(file, { force: true });
    throw err;
  }
}

async function main(): Promise<void> {
  const { manifest, dir, pruned } = await runBackup();
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  console.log(`✅ Backup ${manifest.stamp} en ${dir}`);
  console.log(`   ${manifest.db.file}  ${mb(manifest.db.bytes)}`);
  console.log(
    `   ${manifest.uploads.file}  ${mb(manifest.uploads.bytes)}  (${manifest.uploads.count} fotos)`,
  );
  console.log(
    `   ${manifest.counts.wines_active} vinos · ${manifest.counts.reviews} reseñas · ${manifest.counts.users} usuarios`,
  );
  if (pruned.length > 0) console.log(`🗑️  ${pruned.length} archivos viejos borrados por retención.`);

  const remote = s3ConfigFromEnv();
  if (!remote) {
    console.log('\n⚠️  Sin BACKUP_S3_*: el backup es SOLO LOCAL.');
    console.log('   Vive en el mismo volumen que la base y no te salva de perderlo.');
    return;
  }

  // El backup local ya está en disco y no se toca: si falla la subida, se sale con
  // error para que el cron lo marque, pero lo que se generó sigue ahí.
  const keys = await uploadBackupSet(remote, dir, manifest);
  console.log(`\n☁️  ${keys.length} archivos subidos a ${remote.bucket}/${remote.prefix}/`);
}

// Solo corre como CLI (`pnpm db:backup`); importarlo desde tests no dispara nada.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('❌ Backup fallido:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
