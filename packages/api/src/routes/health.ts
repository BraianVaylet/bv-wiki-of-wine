import { Hono } from 'hono';
import type { DB } from '../db/connection';
import type { AppEnv } from '../types';

/**
 * Health check real: toca la base. Un endpoint que solo devuelve `200 OK` sin
 * consultar SQLite miente cuando el volumen no está montado, y Railway sigue
 * mandando tráfico a un contenedor roto.
 */
export function healthRoutes(db: DB) {
  const r = new Hono<AppEnv>();

  r.get('/', (c) => {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      dbStatus = 'error';
    }
    const body = { status: dbStatus === 'ok' ? 'ok' : 'degraded', db: dbStatus };
    return c.json(body, dbStatus === 'ok' ? 200 : 503);
  });

  return r;
}
