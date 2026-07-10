import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../env';
import { SCHEMA_SQL } from './schema';

export type DB = Database.Database;

const MEMORY = ':memory:';
/** Reintentar ante SQLITE_BUSY en vez de tirar el error de una. */
const BUSY_TIMEOUT_MS = 5000;

/** Crea una conexión SQLite con los PRAGMAs requeridos y aplica el esquema. */
export function createDb(path: string = env.DATABASE_PATH): DB {
  if (path !== MEMORY) {
    mkdirSync(dirname(path), { recursive: true });
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
