import { Hono } from 'hono';
import type { DB } from '../db/connection';
import { catalogRepo } from '../repositories/catalogRepo';
import type { AppEnv } from '../types';

const MIN_WINERY_QUERY = 1;

/** Catálogos auxiliares: uvas (todas) y bodegas (autocomplete). Tras requireAuth. */
export function catalogRoutes(db: DB) {
  const r = new Hono<AppEnv>();

  r.get('/grapes', (c) => c.json(catalogRepo.listGrapes(db)));

  r.get('/wineries', (c) => {
    const query = (c.req.query('query') ?? '').trim();
    if (query.length < MIN_WINERY_QUERY) return c.json([]);
    return c.json(catalogRepo.suggestWineries(db, query));
  });

  return r;
}
