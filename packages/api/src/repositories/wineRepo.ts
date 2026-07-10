import type { WineAggregates, WineListItem, WineQuery, WineType, WineryRef } from '@bv/shared';
import type { DB } from '../db/connection';

/** Fila de vino + agregados, tal como sale de la query de listado. */
interface WineAggRow {
  id: number;
  name: string;
  type: WineType;
  vintage: number | null;
  country: string | null;
  region: string | null;
  photo_file: string | null;
  created_by: number | null;
  created_at: number;
  winery_id: number | null;
  winery_name: string | null;
  review_count: number;
  avg_overall: number | null;
  reviewed_by_me: number;
}

/** Campos que definen la identidad/estado de un vino, sin agregados ni uvas. */
export interface WineRecord {
  id: number;
  name: string;
  type: WineType;
  vintage: number | null;
  wineryId: number | null;
  country: string | null;
  region: string | null;
  photoFile: string | null;
  createdBy: number | null;
  deletedAt: number | null;
}

interface WineRow {
  id: number;
  name: string;
  type: WineType;
  vintage: number | null;
  winery_id: number | null;
  country: string | null;
  region: string | null;
  photo_file: string | null;
  created_by: number | null;
  deleted_at: number | null;
}

function toRecord(row: WineRow): WineRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    vintage: row.vintage,
    wineryId: row.winery_id,
    country: row.country,
    region: row.region,
    photoFile: row.photo_file,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
  };
}

/** URL de la foto vía la ruta autenticada, o `null` si no hay. */
function photoUrl(row: { id: number; photo_file: string | null }): string | null {
  return row.photo_file ? `/api/wines/${row.id}/photo` : null;
}

function toListItem(row: WineAggRow, grapes: string[]): WineListItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    vintage: row.vintage,
    winery: row.winery_id ? { id: row.winery_id, name: row.winery_name ?? '' } : null,
    grapes,
    country: row.country,
    region: row.region,
    photoUrl: photoUrl(row),
    // AVG devuelve null sin filas: un vino sin reseñas tiene avgOverall null, no 0.
    avgOverall: row.avg_overall,
    reviewCount: row.review_count,
    reviewedByMe: row.reviewed_by_me === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Placeholders `?,?,?` para un IN (...). Nunca interpolar ids en el SQL. */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

/** Uvas de un conjunto de vinos, en UNA query. Evita el N+1 del listado. */
function grapesByWine(db: DB, wineIds: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (wineIds.length === 0) return map;
  const rows = db
    .prepare(
      `SELECT wg.wine_id AS wineId, g.name AS name
         FROM wine_grapes wg JOIN grapes g ON g.id = wg.grape_id
        WHERE wg.wine_id IN (${placeholders(wineIds.length)})
        ORDER BY g.name`,
    )
    .all(...wineIds) as { wineId: number; name: string }[];
  for (const { wineId, name } of rows) {
    const list = map.get(wineId) ?? [];
    list.push(name);
    map.set(wineId, list);
  }
  return map;
}

export interface WineListResult {
  items: WineListItem[];
  nextCursor: string | null;
}

export interface NewWine {
  name: string;
  type: WineType;
  vintage: number | null;
  wineryId: number | null;
  country: string | null;
  region: string | null;
  createdBy: number;
  createdAt: number;
}

export const wineRepo = {
  /**
   * Listado con agregados. Dos queries (vinos + uvas), nunca 1+N.
   * Keyset sobre (created_at, id) para `recent`; OFFSET para `rating` (avg es
   * calculado y el keyset sobre él es frágil — ver docs/02-data-model.md §7).
   */
  list(db: DB, query: WineQuery, actorId: number): WineListResult {
    const where: string[] = ['w.deleted_at IS NULL'];
    const params: Record<string, unknown> = { userId: actorId, limit: query.limit + 1 };

    if (query.type) {
      where.push('w.type = @type');
      params.type = query.type;
    }
    if (query.query) {
      where.push('(w.name LIKE @like OR wr.name LIKE @like)');
      params.like = `%${query.query}%`;
    }
    if (query.grapeId) {
      where.push(
        'EXISTS (SELECT 1 FROM wine_grapes wg WHERE wg.wine_id = w.id AND wg.grape_id = @grapeId)',
      );
      params.grapeId = query.grapeId;
    }

    let orderBy: string;
    if (query.sort === 'rating') {
      // NULLS LAST manual: los vinos sin reseñas van al final, no arriba.
      orderBy = 'ORDER BY avg_overall IS NULL, avg_overall DESC, w.id DESC';
      params.offset = (query.page - 1) * query.limit;
    } else {
      orderBy = 'ORDER BY w.created_at DESC, w.id DESC';
      if (query.cursor) {
        const [createdAt, id] = query.cursor.split('_').map(Number);
        where.push(
          '(w.created_at < @curCreated OR (w.created_at = @curCreated AND w.id < @curId))',
        );
        params.curCreated = createdAt;
        params.curId = id;
      }
    }

    const pagination = query.sort === 'rating' ? 'LIMIT @limit OFFSET @offset' : 'LIMIT @limit';

    const rows = db
      .prepare(
        `SELECT w.id, w.name, w.type, w.vintage, w.country, w.region, w.photo_file,
                w.created_by, w.created_at, w.winery_id,
                wr.name AS winery_name,
                COUNT(r.id) AS review_count,
                AVG(r.overall) AS avg_overall,
                MAX(CASE WHEN r.user_id = @userId THEN 1 ELSE 0 END) AS reviewed_by_me
           FROM wines w
           LEFT JOIN wineries wr ON wr.id = w.winery_id
           LEFT JOIN reviews  r  ON r.wine_id = w.id
          WHERE ${where.join(' AND ')}
          GROUP BY w.id
          ${orderBy}
          ${pagination}`,
      )
      .all(params) as WineAggRow[];

    // Pedimos limit+1 para saber si hay página siguiente sin un COUNT extra.
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const grapes = grapesByWine(
      db,
      page.map((r) => r.id),
    );
    const items = page.map((r) => toListItem(r, grapes.get(r.id) ?? []));

    let nextCursor: string | null = null;
    if (hasMore && query.sort === 'recent') {
      const last = page.at(-1);
      if (last) nextCursor = `${last.created_at}_${last.id}`;
    }

    return { items, nextCursor };
  },

  findById(db: DB, id: number): WineRecord | null {
    const row = db.prepare('SELECT * FROM wines WHERE id = ?').get(id) as WineRow | undefined;
    return row ? toRecord(row) : null;
  },

  /** Vino como item de lista (con agregados y uvas), para el detalle. */
  findListItem(db: DB, id: number, actorId: number): WineListItem | null {
    const row = db
      .prepare(
        `SELECT w.id, w.name, w.type, w.vintage, w.country, w.region, w.photo_file,
                w.created_by, w.created_at, w.winery_id,
                wr.name AS winery_name,
                COUNT(r.id) AS review_count,
                AVG(r.overall) AS avg_overall,
                MAX(CASE WHEN r.user_id = @userId THEN 1 ELSE 0 END) AS reviewed_by_me
           FROM wines w
           LEFT JOIN wineries wr ON wr.id = w.winery_id
           LEFT JOIN reviews  r  ON r.wine_id = w.id
          WHERE w.id = @id
          GROUP BY w.id`,
      )
      .get({ id, userId: actorId }) as WineAggRow | undefined;
    if (!row) return null;
    const grapes = grapesByWine(db, [id]);
    return toListItem(row, grapes.get(id) ?? []);
  },

  aggregates(db: DB, wineId: number): WineAggregates {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS review_count,
                AVG(overall)         AS avg_overall,
                AVG(taste)           AS avg_taste,
                AVG(aroma)           AS avg_aroma,
                AVG(body)            AS avg_body,
                AVG(value_for_money) AS avg_value_for_money
           FROM reviews WHERE wine_id = ?`,
      )
      .get(wineId) as {
      review_count: number;
      avg_overall: number | null;
      avg_taste: number | null;
      avg_aroma: number | null;
      avg_body: number | null;
      avg_value_for_money: number | null;
    };
    return {
      reviewCount: row.review_count,
      avgOverall: row.avg_overall,
      avgTaste: row.avg_taste,
      avgAroma: row.avg_aroma,
      avgBody: row.avg_body,
      avgValueForMoney: row.avg_value_for_money,
    };
  },

  /** Id del vino no borrado que colisiona en identidad, o null. Para el 409. */
  findDuplicateId(
    db: DB,
    name: string,
    wineryId: number | null,
    vintage: number | null,
  ): number | null {
    const row = db
      .prepare(
        `SELECT id FROM wines
          WHERE deleted_at IS NULL
            AND name = ?
            AND IFNULL(winery_id, 0) = IFNULL(?, 0)
            AND IFNULL(vintage, 0)  = IFNULL(?, 0)`,
      )
      .get(name, wineryId, vintage) as { id: number } | undefined;
    return row?.id ?? null;
  },

  insert(db: DB, wine: NewWine): number {
    const row = db
      .prepare(
        `INSERT INTO wines (name, type, vintage, winery_id, country, region, created_by, created_at, updated_at)
         VALUES (@name, @type, @vintage, @wineryId, @country, @region, @createdBy, @createdAt, @createdAt)
         RETURNING id`,
      )
      .get(wine) as { id: number };
    return row.id;
  },

  addGrape(db: DB, wineId: number, grapeId: number): void {
    db.prepare('INSERT OR IGNORE INTO wine_grapes (wine_id, grape_id) VALUES (?, ?)').run(
      wineId,
      grapeId,
    );
  },

  replaceGrapes(db: DB, wineId: number, grapeIds: number[]): void {
    db.prepare('DELETE FROM wine_grapes WHERE wine_id = ?').run(wineId);
    for (const grapeId of grapeIds) this.addGrape(db, wineId, grapeId);
  },

  update(db: DB, id: number, fields: Partial<NewWine>, updatedAt: number): void {
    const set: string[] = [];
    const params: Record<string, unknown> = { id, updatedAt };
    const columns: Record<string, keyof NewWine> = {
      name: 'name',
      type: 'type',
      vintage: 'vintage',
      winery_id: 'wineryId',
      country: 'country',
      region: 'region',
    };
    for (const [column, key] of Object.entries(columns)) {
      if (fields[key] !== undefined) {
        set.push(`${column} = @${key}`);
        params[key] = fields[key];
      }
    }
    if (set.length === 0) return;
    db.prepare(`UPDATE wines SET ${set.join(', ')}, updated_at = @updatedAt WHERE id = @id`).run(
      params,
    );
  },

  setPhotoFile(db: DB, id: number, photoFile: string | null, updatedAt: number): void {
    db.prepare('UPDATE wines SET photo_file = ?, updated_at = ? WHERE id = ?').run(
      photoFile,
      updatedAt,
      id,
    );
  },

  softDelete(db: DB, id: number, deletedAt: number): void {
    db.prepare('UPDATE wines SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
      deletedAt,
      deletedAt,
      id,
    );
  },

  countReviews(db: DB, wineId: number): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE wine_id = ?').get(wineId) as {
      n: number;
    };
    return row.n;
  },
};

export { photoUrl };
