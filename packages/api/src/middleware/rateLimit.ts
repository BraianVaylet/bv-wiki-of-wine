import type { MiddlewareHandler } from 'hono';
import { rateLimited } from '../lib/errors';
import { now } from '../lib/time';
import type { AppEnv } from '../types';

interface Bucket {
  count: number;
  resetAt: number;
}

/** Cada cuántas requests se barren los buckets vencidos (evita fuga de memoria). */
const SWEEP_EVERY = 500;

function clientIp(headers: {
  forwarded?: string;
  real?: string;
}): string {
  return headers.forwarded?.split(',')[0]?.trim() || headers.real || 'local';
}

/**
 * Rate limiter en memoria (ventana fija). Suficiente para UNA instancia, que es
 * lo único que soporta SQLite como escritor (docs/08-hosting.md §2).
 *
 * `by: 'actor'` limita por usuario autenticado; requiere correr después de requireAuth.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  prefix?: string;
  by?: 'ip' | 'actor';
}): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, Bucket>();
  const prefix = opts.prefix ?? 'g';
  let hits = 0;

  return async (c, next) => {
    const ts = now();

    if (++hits % SWEEP_EVERY === 0) {
      for (const [k, b] of buckets) if (b.resetAt < ts) buckets.delete(k);
    }

    const subject =
      opts.by === 'actor'
        ? `u${c.get('actor').id}`
        : clientIp({
            forwarded: c.req.header('x-forwarded-for'),
            real: c.req.header('x-real-ip'),
          });

    const key = `${prefix}:${subject}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < ts) {
      buckets.set(key, { count: 1, resetAt: ts + opts.windowMs });
    } else {
      bucket.count++;
      if (bucket.count > opts.max) {
        const retrySec = Math.max(Math.ceil((bucket.resetAt - ts) / 1000), 1);
        c.header('Retry-After', String(retrySec));
        throw rateLimited();
      }
    }
    await next();
  };
}
