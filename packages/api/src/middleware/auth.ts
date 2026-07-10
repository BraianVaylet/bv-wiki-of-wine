import type { MiddlewareHandler } from 'hono';
import type { DB } from '../db/connection';
import { isCsrfValid } from '../lib/csrf';
import { csrfInvalid, unauthenticated } from '../lib/errors';
import { getSessionToken } from '../lib/session';
import { now } from '../lib/time';
import { hmac } from '../lib/tokens';
import { sessionRepo } from '../repositories/sessionRepo';
import type { AppEnv } from '../types';

/**
 * Exige sesión válida y expone el `actor` en el contexto.
 *
 * El actor sale SIEMPRE de acá. Ningún handler debe leer un `userId` del body:
 * eso permitiría actuar en nombre de otro.
 */
export function requireAuth(db: DB): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getSessionToken(c);
    if (!token) throw unauthenticated();
    const actor = sessionRepo.findActor(db, hmac(token), now());
    if (!actor) throw unauthenticated();
    c.set('actor', actor);
    await next();
  };
}

/** Exige token CSRF válido en mutaciones (double-submit). */
export const requireCsrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!isCsrfValid(c)) throw csrfInvalid();
  await next();
};
