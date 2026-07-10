import type { Grape, WineryRef } from '@bv/shared';
import type { DB } from '../db/connection';

const WINERY_SUGGEST_LIMIT = 10;

interface GrapeRow {
  id: number;
  name: string;
}

interface WineryRow {
  id: number;
  name: string;
}

/**
 * Bodegas y uvas: catálogos compartidos que se crean al vuelo. El `find-or-create`
 * es case-insensitive (columnas COLLATE NOCASE) para no duplicar "Catena"/"catena".
 */
export const catalogRepo = {
  listGrapes(db: DB): Grape[] {
    return db.prepare('SELECT id, name FROM grapes ORDER BY name').all() as GrapeRow[];
  },

  /** Uva por nombre exacto (NOCASE). */
  findGrapeByName(db: DB, name: string): Grape | null {
    const row = db.prepare('SELECT id, name FROM grapes WHERE name = ?').get(name) as
      | GrapeRow
      | undefined;
    return row ?? null;
  },

  createGrape(db: DB, name: string, createdAt: number): Grape {
    return db
      .prepare('INSERT INTO grapes (name, created_at) VALUES (?, ?) RETURNING id, name')
      .get(name, createdAt) as Grape;
  },

  /** Devuelve la uva existente o la crea. Debe correr dentro de una transacción. */
  findOrCreateGrape(db: DB, name: string, createdAt: number): Grape {
    return this.findGrapeByName(db, name) ?? this.createGrape(db, name, createdAt);
  },

  /** Autocomplete de bodega: prefijo, top N. */
  suggestWineries(db: DB, query: string): WineryRef[] {
    return db
      .prepare('SELECT id, name FROM wineries WHERE name LIKE ? ORDER BY name LIMIT ?')
      .all(`${query}%`, WINERY_SUGGEST_LIMIT) as WineryRow[];
  },

  findWineryByName(db: DB, name: string): WineryRef | null {
    const row = db.prepare('SELECT id, name FROM wineries WHERE name = ?').get(name) as
      | WineryRow
      | undefined;
    return row ?? null;
  },

  findOrCreateWinery(db: DB, name: string, createdBy: number, createdAt: number): WineryRef {
    const existing = this.findWineryByName(db, name);
    if (existing) return existing;
    return db
      .prepare(
        'INSERT INTO wineries (name, created_by, created_at) VALUES (?, ?, ?) RETURNING id, name',
      )
      .get(name, createdBy, createdAt) as WineryRef;
  },
};
