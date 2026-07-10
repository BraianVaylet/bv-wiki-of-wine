/**
 * Esquema SQL embebido (ver docs/02-data-model.md). Embebido como string para
 * evitar problemas de rutas de archivos entre dev (tsx) y producción.
 *
 * Timestamps: epoch ms UTC (INTEGER). Booleanos: 0/1 con CHECK.
 */

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

-- ── Identidad ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  alias                TEXT    NOT NULL COLLATE NOCASE,
  password_hash        TEXT    NOT NULL,
  security_question_id INTEGER NOT NULL,
  security_answer_hash TEXT    NOT NULL,
  is_admin             INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         INTEGER,
  created_at           INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_alias ON users (alias);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- ── Catálogo compartido ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wineries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL COLLATE NOCASE,
  country    TEXT,
  region     TEXT,
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wineries_name ON wineries (name);

CREATE TABLE IF NOT EXISTS grapes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL COLLATE NOCASE,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_grapes_name ON grapes (name);

CREATE TABLE IF NOT EXISTS wines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL COLLATE NOCASE,
  winery_id  INTEGER,
  type       TEXT    NOT NULL
             CHECK (type IN ('tinto','blanco','rosado','espumante','naranjo','dulce')),
  vintage    INTEGER CHECK (vintage IS NULL OR vintage BETWEEN 1900 AND 2100),
  country    TEXT,
  region     TEXT,
  photo_file TEXT,
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (winery_id)  REFERENCES wineries (id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users    (id) ON DELETE SET NULL
);

-- Anti-duplicado: misma etiqueta + bodega + cosecha = mismo vino.
-- Parcial (WHERE deleted_at IS NULL): un vino borrado no bloquea recrearlo.
-- IFNULL para que "sin bodega" colisione con "sin bodega" (NULL != NULL en SQL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wines_identity
  ON wines (name, IFNULL(winery_id, 0), IFNULL(vintage, 0))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wines_created ON wines (created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wines_winery ON wines (winery_id);

CREATE TABLE IF NOT EXISTS wine_grapes (
  wine_id  INTEGER NOT NULL,
  grape_id INTEGER NOT NULL,
  PRIMARY KEY (wine_id, grape_id),
  FOREIGN KEY (wine_id)  REFERENCES wines  (id) ON DELETE CASCADE,
  FOREIGN KEY (grape_id) REFERENCES grapes (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_wine_grapes_grape ON wine_grapes (grape_id);

-- ── Opinión personal ─────────────────────────────────────────────────────────
-- Los ejes opcionales usan NULL para "no lo puntué". Nunca 0: AVG() ignora los
-- NULL por definición, que es exactamente la semántica que queremos.
CREATE TABLE IF NOT EXISTS reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wine_id         INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  overall         INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  taste           INTEGER CHECK (taste           IS NULL OR taste           BETWEEN 1 AND 5),
  aroma           INTEGER CHECK (aroma           IS NULL OR aroma           BETWEEN 1 AND 5),
  body            INTEGER CHECK (body            IS NULL OR body            BETWEEN 1 AND 5),
  value_for_money INTEGER CHECK (value_for_money IS NULL OR value_for_money BETWEEN 1 AND 5),
  notes           TEXT    NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY (wine_id) REFERENCES wines (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
-- RN-2: una reseña por persona por vino, garantizado por la base, no por el código.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_wine_user ON reviews (wine_id, user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_wine ON reviews (wine_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews (user_id, overall DESC);
`;
