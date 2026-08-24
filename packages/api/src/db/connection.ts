import { constants, accessSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../env';
import { SCHEMA_SQL } from './schema';

export type DB = Database.Database;

const MEMORY = ':memory:';
/** Reintentar ante SQLITE_BUSY en vez de tirar el error de una. */
const BUSY_TIMEOUT_MS = 5000;

/**
 * Verifica que se pueda escribir en el directorio de la base **antes** de abrirla.
 *
 * Sin esto, un volumen montado sin permisos hace fallar el arranque con un EACCES
 * pelado: el proceso muere antes de escuchar, el healthcheck da timeout y el
 * deploy falla sin decir por qué. El caso concreto: Railway monta el volumen en
 * runtime y pisa el `chown` del build, así que `/data` queda de root mientras el
 * proceso corre como `node`.
 */
export function ensureWritableDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'desconocido';
    throw new Error(
      `No se puede escribir en ${resolve(dir)} (${code}). Si es un volumen montado, el proceso no tiene permisos sobre el mount point. Ver docs/08-hosting.md §4.`,
    );
  }
}

/** Crea una conexión SQLite con los PRAGMAs requeridos y aplica el esquema. */
export function createDb(path: string = env.DATABASE_PATH): DB {
  if (path !== MEMORY) {
    ensureWritableDir(dirname(path));
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  // SQLite trae las FK apagadas por defecto, y es POR CONEXIÓN: sin esto se
  // declaran en el esquema, se ven, y no hacen absolutamente nada.
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec(SCHEMA_SQL);
  return db;
}

let singleton: DB | null = null;

/** Conexión compartida del proceso. */
export function getDb(): DB {
  if (!singleton) singleton = createDb();
  return singleton;
}
