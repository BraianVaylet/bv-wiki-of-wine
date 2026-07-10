import type { MyReview, Review, WineListItem } from '@bv/shared';
import type { DB } from '../db/connection';

/** Fila de reseña con el alias del autor, tal como se lista en el detalle. */
interface ReviewRow {
  id: number;
  user_id: number;
  alias: string;
  overall: number;
  taste: number | null;
  aroma: number | null;
  body: number | null;
  value_for_money: number | null;
  notes: string;
  created_at: number;
  updated_at: number;
}

function toReview(row: ReviewRow, actorId: number): Review {
  return {
    id: row.id,
    author: { id: row.user_id, alias: row.alias },
    overall: row.overall,
    taste: row.taste,
    aroma: row.aroma,
    body: row.body,
    valueForMoney: row.value_for_money,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isMine: row.user_id === actorId,
  };
}

export interface UpsertReviewData {
  wineId: number;
  userId: number;
  overall: number;
  taste: number | null;
  aroma: number | null;
  body: number | null;
  valueForMoney: number | null;
  notes: string;
}

export const reviewRepo = {
  /**
   * Reseñas de un vino. La propia va primero (para editar inline); el resto por
   * fecha descendente.
   */
  listForWine(db: DB, wineId: number, actorId: number): Review[] {
    const rows = db
      .prepare(
        `SELECT r.id, r.user_id, u.alias, r.overall, r.taste, r.aroma, r.body,
                r.value_for_money, r.notes, r.created_at, r.updated_at
           FROM reviews r JOIN users u ON u.id = r.user_id
          WHERE r.wine_id = ?
          ORDER BY (r.user_id = ?) DESC, r.created_at DESC`,
      )
      .all(wineId, actorId) as ReviewRow[];
    return rows.map((row) => toReview(row, actorId));
  },

  findMine(db: DB, wineId: number, userId: number): Review | null {
    const row = db
      .prepare(
        `SELECT r.id, r.user_id, u.alias, r.overall, r.taste, r.aroma, r.body,
                r.value_for_money, r.notes, r.created_at, r.updated_at
           FROM reviews r JOIN users u ON u.id = r.user_id
          WHERE r.wine_id = ? AND r.user_id = ?`,
      )
      .get(wineId, userId) as ReviewRow | undefined;
    return row ? toReview(row, userId) : null;
  },

  /**
   * Upsert atómico (RN-2). Una reseña por (wine, user): el segundo PUT actualiza
   * en vez de duplicar, sin SELECT previo ni race condition.
   */
  upsert(db: DB, data: UpsertReviewData, ts: number): void {
    db.prepare(
      `INSERT INTO reviews
         (wine_id, user_id, overall, taste, aroma, body, value_for_money, notes, created_at, updated_at)
       VALUES
         (@wineId, @userId, @overall, @taste, @aroma, @body, @valueForMoney, @notes, @ts, @ts)
       ON CONFLICT (wine_id, user_id) DO UPDATE SET
         overall = excluded.overall,
         taste = excluded.taste,
         aroma = excluded.aroma,
         body = excluded.body,
         value_for_money = excluded.value_for_money,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
    ).run({ ...data, ts });
  },

  /** Borra la reseña propia. Devuelve si existía. */
  deleteMine(db: DB, wineId: number, userId: number): boolean {
    const info = db
      .prepare('DELETE FROM reviews WHERE wine_id = ? AND user_id = ?')
      .run(wineId, userId);
    return info.changes > 0;
  },

  /** Reseñas propias con el vino embebido (pantalla "Mis reseñas"). */
  listMine(db: DB, userId: number, sort: 'recent' | 'rating'): MyReview[] {
    const orderBy = sort === 'rating' ? 'r.overall DESC, r.updated_at DESC' : 'r.updated_at DESC';
    const rows = db
      .prepare(
        `SELECT r.id, r.overall, r.taste, r.aroma, r.body, r.value_for_money, r.notes,
                r.created_at, r.updated_at,
                w.id AS wine_id, w.name AS wine_name, w.type AS wine_type, w.vintage AS wine_vintage,
                w.country AS wine_country, w.region AS wine_region, w.photo_file AS wine_photo,
                w.created_by AS wine_created_by, w.created_at AS wine_created_at,
                wr.id AS winery_id, wr.name AS winery_name
           FROM reviews r
           JOIN wines w ON w.id = r.wine_id
           LEFT JOIN wineries wr ON wr.id = w.winery_id
          WHERE r.user_id = ? AND w.deleted_at IS NULL
          ORDER BY ${orderBy}`,
      )
      .all(userId) as MyReviewRow[];

    if (rows.length === 0) return [];

    const grapes = grapesByWine(
      db,
      rows.map((r) => r.wine_id),
    );
    return rows.map((row) => toMyReview(row, grapes.get(row.wine_id) ?? []));
  },
};

interface MyReviewRow {
  id: number;
  overall: number;
  taste: number | null;
  aroma: number | null;
  body: number | null;
  value_for_money: number | null;
  notes: string;
  created_at: number;
  updated_at: number;
  wine_id: number;
  wine_name: string;
  wine_type: WineListItem['type'];
  wine_vintage: number | null;
  wine_country: string | null;
  wine_region: string | null;
  wine_photo: string | null;
  wine_created_by: number | null;
  wine_created_at: number;
  winery_id: number | null;
  winery_name: string | null;
}

function toMyReview(row: MyReviewRow, grapes: string[]): MyReview {
  const wine: WineListItem = {
    id: row.wine_id,
    name: row.wine_name,
    type: row.wine_type,
    vintage: row.wine_vintage,
    winery: row.winery_id ? { id: row.winery_id, name: row.winery_name ?? '' } : null,
    grapes,
    country: row.wine_country,
    region: row.wine_region,
    photoUrl: row.wine_photo ? `/api/wines/${row.wine_id}/photo` : null,
    // "Mis reseñas" no recalcula el promedio global del vino: no hace falta acá.
    avgOverall: row.overall,
    reviewCount: 1,
    reviewedByMe: true,
    createdBy: row.wine_created_by,
    createdAt: row.wine_created_at,
  };
  return {
    id: row.id,
    overall: row.overall,
    taste: row.taste,
    aroma: row.aroma,
    body: row.body,
    valueForMoney: row.value_for_money,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wine,
  };
}

function grapesByWine(db: DB, wineIds: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (wineIds.length === 0) return map;
  const unique = [...new Set(wineIds)];
  const rows = db
    .prepare(
      `SELECT wg.wine_id AS wineId, g.name AS name
         FROM wine_grapes wg JOIN grapes g ON g.id = wg.grape_id
        WHERE wg.wine_id IN (${unique.map(() => '?').join(',')})
        ORDER BY g.name`,
    )
    .all(...unique) as { wineId: number; name: string }[];
  for (const { wineId, name } of rows) {
    const list = map.get(wineId) ?? [];
    list.push(name);
    map.set(wineId, list);
  }
  return map;
}
