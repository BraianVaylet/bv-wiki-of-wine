# 02 · Modelo de datos — SQLite

Motor: **SQLite** vía `better-sqlite3` (igual que `bv-cross` y `bv-bow-sight`).
Síncrono, sin pool, sin ORM. Consultas parametrizadas siempre.

El esquema vive embebido como string en `src/db/schema.ts` (no un `.sql` suelto):
evita problemas de resolución de rutas entre `tsx` en dev y el bundle en prod.
Mismo patrón que `bv-bow-sight`.

---

## 1. Diagrama

```
users ──1:N──> sessions
  │
  │ created_by (nullable, SET NULL)
  ├──────────────> wines <──N:1── wineries
  │                  │
  │                  └──N:M──> grapes   (wine_grapes)
  │
  └──1:N──> reviews ──N:1──> wines
            UNIQUE (wine_id, user_id)
```

---

## 2. Convenciones

- **Timestamps:** `INTEGER` = epoch **milisegundos** UTC. Nunca `TEXT`, nunca
  local time. El formateo es del cliente.
- **Booleanos:** `INTEGER` 0/1 + `CHECK (col IN (0,1))`.
- **Texto libre opcional:** `TEXT` nullable. Texto que "existe pero puede estar
  vacío" (ej. `notes`): `TEXT NOT NULL DEFAULT ''`. Distinguir "no aplica" de
  "vacío" evita `IS NULL OR = ''` disperso por el código.
- **Nombres:** `snake_case` en SQL, `camelCase` en TS. El mapeo es explícito en
  los repositorios (una función `rowToWine`), no automático.
- **Borrado:** duro salvo `wines`, que usa `deleted_at` (ver §5).

---

## 3. Esquema

```sql
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
  photo_file TEXT,     -- nombre de archivo (uuid.webp), NUNCA una ruta del cliente
  created_by INTEGER,  -- NULL si el creador se dio de baja: el vino queda de la comunidad
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (winery_id)  REFERENCES wineries (id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users    (id) ON DELETE SET NULL
);

-- Anti-duplicado: misma etiqueta + bodega + cosecha = mismo vino.
-- Parcial: los borrados no bloquean recrear. IFNULL para que NULL colisione con NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wines_identity
  ON wines (name, IFNULL(winery_id, 0), IFNULL(vintage, 0))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wines_created ON wines (created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wines_winery  ON wines (winery_id);

CREATE TABLE IF NOT EXISTS wine_grapes (
  wine_id  INTEGER NOT NULL,
  grape_id INTEGER NOT NULL,
  PRIMARY KEY (wine_id, grape_id),
  FOREIGN KEY (wine_id)  REFERENCES wines  (id) ON DELETE CASCADE,
  FOREIGN KEY (grape_id) REFERENCES grapes (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_wine_grapes_grape ON wine_grapes (grape_id);

-- ── Opinión personal ─────────────────────────────────────────────────────────
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
```

### PRAGMAs de conexión

```ts
db.pragma('journal_mode = WAL');   // lecturas concurrentes con una escritura
db.pragma('foreign_keys = ON');    // SQLite las tiene OFF por defecto (!)
db.pragma('busy_timeout = 5000');  // reintenta en vez de tirar SQLITE_BUSY
```

`foreign_keys = ON` **por conexión**, no por base. Olvidarlo es el bug clásico de
SQLite: las FK se declaran, se ven en el esquema, y no hacen nada.

---

## 4. La decisión del `NULL` vs `0`

Los ejes opcionales usan `NULL` para "no lo puntué". **Nunca `0`.**

```sql
-- Promedio de aroma: los NULL se ignoran solos.
SELECT AVG(aroma) FROM reviews WHERE wine_id = ?;
```

Si "no puntuado" fuera `0`, `AVG` lo contaría y un vino con dos reseñas
(aroma=5, aroma="no puntué") daría **2.5** en vez de **5**. `AVG()` de SQL ignora
`NULL` por definición — es exactamente la semántica que queremos, gratis.

Corolario para la API: el campo se serializa como `null`, no como `0` ni se omite.
El front distingue `null` → mostrar `—`.

---

## 5. Soft delete de vinos

`wines.deleted_at` en vez de `DELETE`. Motivo: un vino borrado se lleva por
`CASCADE` las reseñas de **otras personas**. Que el creador de un vino pueda
destruir la opinión de su pareja con un tap es inaceptable.

- Todo listado filtra `WHERE deleted_at IS NULL`.
- El índice único de identidad es **parcial** (`WHERE deleted_at IS NULL`), así se
  puede recrear un vino borrado.
- Los índices de listado también son parciales: no indexan basura.
- Un job de limpieza (`db:purge`) puede borrar duro lo que lleva > 90 días
  borrado. **Fase 2**, no MVP.

Las reseñas sí se borran duro: son de una sola persona y no cuelga nada de ellas.

---

## 6. Consultas clave

### 6.1 · Listado de la home (sin N+1)

Dos queries, no `1 + N`:

```sql
-- (1) vinos + agregados
SELECT
  w.id, w.name, w.type, w.vintage, w.country, w.region, w.photo_file, w.created_at,
  wr.name                      AS winery_name,
  COUNT(r.id)                  AS review_count,
  AVG(r.overall)               AS avg_overall,
  MAX(r.user_id = :userId)     AS reviewed_by_me   -- 0/1
FROM wines w
LEFT JOIN wineries wr ON wr.id = w.winery_id
LEFT JOIN reviews  r  ON r.wine_id = w.id
WHERE w.deleted_at IS NULL
  AND (:type  IS NULL OR w.type = :type)
  AND (:query IS NULL OR w.name LIKE :like OR wr.name LIKE :like)
GROUP BY w.id
ORDER BY w.created_at DESC, w.id DESC
LIMIT :limit;
```

```sql
-- (2) uvas de esos vinos, en un solo golpe
SELECT wg.wine_id, g.name
FROM wine_grapes wg
JOIN grapes g ON g.id = wg.grape_id
WHERE wg.wine_id IN (/* ids de (1), expandidos como placeholders */);
```

El repositorio arma un `Map<wineId, string[]>` y las pega. **Nunca** un
`SELECT grapes WHERE wine_id = ?` dentro de un `.map()`.

> ⚠️ El `IN (...)` se construye con **placeholders generados** (`?,?,?`), no
> interpolando ids. Aunque sean enteros nuestros: la regla es que ningún valor
> entra al SQL por concatenación. Sin excepciones que después se copian y pegan.

### 6.2 · Agregados por eje (detalle)

```sql
SELECT
  COUNT(*)              AS review_count,
  AVG(overall)          AS avg_overall,
  AVG(taste)            AS avg_taste,            -- NULL si nadie puntuó el eje
  AVG(aroma)            AS avg_aroma,
  AVG(body)             AS avg_body,
  AVG(value_for_money)  AS avg_value_for_money
FROM reviews WHERE wine_id = ?;
```

### 6.3 · Upsert de reseña (CU-5)

```sql
INSERT INTO reviews (wine_id, user_id, overall, taste, aroma, body, value_for_money,
                     notes, created_at, updated_at)
VALUES (@wineId, @userId, @overall, @taste, @aroma, @body, @valueForMoney,
        @notes, @now, @now)
ON CONFLICT (wine_id, user_id) DO UPDATE SET
  overall         = excluded.overall,
  taste           = excluded.taste,
  aroma           = excluded.aroma,
  body            = excluded.body,
  value_for_money = excluded.value_for_money,
  notes           = excluded.notes,
  updated_at      = excluded.updated_at
RETURNING *;
```

Una sola sentencia, atómica, sin `SELECT` previo ni race condition. Es la razón
por la que la API expone `PUT /wines/:id/review` y no `POST` + `PATCH`.

### 6.4 · Crear vino con uvas

Envuelto en `db.transaction(...)` de `better-sqlite3`: insert del vino + N inserts
en `wine_grapes` + posibles inserts de `wineries`/`grapes` nuevas. Si algo falla,
no queda un vino sin uvas.

---

## 7. Paginación

- **Orden "recientes"** (default): keyset sobre `(created_at, id)`.
  `WHERE (created_at, id) < (:cursorCreatedAt, :cursorId)`. Estable, sin `OFFSET`.
- **Orden "mejor puntuados"**: `avg_overall` es un valor **calculado**; el keyset
  sobre él es frágil (empates, cambia al reseñar). Acá usamos `LIMIT/OFFSET`.

> **Trade-off nombrado:** `OFFSET` degrada con muchas filas y puede saltear/repetir
> ítems si alguien reseña mientras paginás. Con cientos de vinos es irrelevante.
> Si el catálogo llega a decenas de miles, la salida es una columna materializada
> `avg_overall` mantenida por trigger. **No lo hagas hoy** — es optimización sin medición.

---

## 8. Búsqueda

`name LIKE '%q%'` con `COLLATE NOCASE`. **No usa índice** (comodín inicial).

Con ≤ 5.000 vinos, un full-scan en SQLite es sub-milisegundo. Si crece: FTS5
(`CREATE VIRTUAL TABLE wines_fts USING fts5(...)`) sincronizado por triggers.
Documentado acá para no re-descubrirlo; no implementado porque hoy no hace falta.

---

## 9. Semillas (`db:seed`)

- **Uvas** (~30): Malbec, Cabernet Sauvignon, Cabernet Franc, Merlot, Bonarda,
  Syrah, Pinot Noir, Tannat, Tempranillo, Petit Verdot, Chardonnay, Sauvignon
  Blanc, Torrontés, Semillón, Viognier, Chenin Blanc, Riesling, Pinot Grigio,
  Moscatel, Criolla, Pedro Giménez, Ancellotta, Garnacha, Sangiovese, Nebbiolo,
  Barbera, Carménère, País, Verdejo, Albariño.
- **Bodegas**: ninguna. Se crean al vuelo; sembrar bodegas argentinas sería
  imponer un criterio y ensuciar el autocomplete.
- En `NODE_ENV=development`, además: 2 usuarios demo y 5 vinos con reseñas
  cruzadas, para poder ver la home con datos reales.

`db:reset` borra el archivo y re-crea. **Refuerza `NODE_ENV !== 'production'`**
antes de hacer nada.

---

## 10. Backups

El archivo `.db` vive en el volumen de Railway. Copiarlo con `cp` mientras la app
escribe **corrompe el backup** (WAL a medio aplicar). Usar la API de backup:

```ts
// scripts/backup.ts — consistente aunque haya escrituras en curso
await db.backup(`/data/backups/wow-${Date.now()}.db`);
```

Ver [08-hosting](08-hosting.md) §5.
