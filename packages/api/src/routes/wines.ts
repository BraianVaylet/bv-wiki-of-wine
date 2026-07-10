import {
  createWineSchema,
  updateWineSchema,
  upsertReviewSchema,
  wineQuerySchema,
} from '@bv/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireCsrf } from '../middleware/auth';
import { parseBody, parseId, parseQuery } from '../middleware/validate';
import type { Services } from '../services';
import type { AppEnv } from '../types';

const sortSchema = z.enum(['recent', 'rating']).default('recent');

/** Rutas de vinos y sus reseñas. Ya montadas tras requireAuth (ver app.ts). */
export function wineRoutes(services: Services) {
  const r = new Hono<AppEnv>();

  r.get('/', (c) => {
    const query = parseQuery(c, wineQuerySchema);
    return c.json(services.wines.list(query, c.get('actor')));
  });

  r.post('/', requireCsrf, async (c) => {
    const input = await parseBody(c, createWineSchema);
    return c.json(services.wines.create(input, c.get('actor')), 201);
  });

  r.get('/:id', (c) => {
    const id = parseId(c.req.param('id'));
    return c.json(services.wines.getDetail(id, c.get('actor')));
  });

  r.patch('/:id', requireCsrf, async (c) => {
    const id = parseId(c.req.param('id'));
    const input = await parseBody(c, updateWineSchema);
    return c.json(services.wines.update(id, input, c.get('actor')));
  });

  r.delete('/:id', requireCsrf, (c) => {
    const id = parseId(c.req.param('id'));
    return c.json(services.wines.remove(id, c.get('actor')));
  });

  // ── Reseñas del vino ──
  r.put('/:id/review', requireCsrf, async (c) => {
    const id = parseId(c.req.param('id'));
    const input = await parseBody(c, upsertReviewSchema);
    return c.json(services.reviews.upsert(id, input, c.get('actor')));
  });

  r.delete('/:id/review', requireCsrf, (c) => {
    const id = parseId(c.req.param('id'));
    services.reviews.remove(id, c.get('actor'));
    return c.body(null, 204);
  });

  return r;
}

/** Rutas propias del usuario: /api/me/reviews. */
export function meRoutes(services: Services) {
  const r = new Hono<AppEnv>();

  r.get('/reviews', (c) => {
    const sort = sortSchema.parse(c.req.query('sort'));
    return c.json({ items: services.reviews.listMine(c.get('actor'), sort) });
  });

  return r;
}
