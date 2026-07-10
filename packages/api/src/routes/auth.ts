import { aliasSchema, loginSchema, recoverySchema, registerSchema } from '@bv/shared';
import { Hono } from 'hono';
import type { DB } from '../db/connection';
import { issueCsrfToken } from '../lib/csrf';
import { notFound, unauthenticated } from '../lib/errors';
import { clearSessionCookie, getSessionToken, setSessionCookie } from '../lib/session';
import { requireAuth, requireCsrf } from '../middleware/auth';
import { parseBody } from '../middleware/validate';
import type { Services } from '../services';
import type { AppEnv } from '../types';

export function authRoutes(db: DB, services: Services) {
  const r = new Hono<AppEnv>();

  r.get('/csrf', (c) => c.json({ csrfToken: issueCsrfToken(c) }));

  r.get('/alias-available', (c) => {
    const parsed = aliasSchema.safeParse(c.req.query('alias') ?? '');
    if (!parsed.success) return c.json({ available: false, valid: false });
    return c.json({ available: services.auth.aliasAvailable(parsed.data), valid: true });
  });

  r.post('/register', async (c) => {
    const input = await parseBody(c, registerSchema);
    const { user, token } = await services.auth.register(input);
    setSessionCookie(c, token);
    issueCsrfToken(c);
    return c.json({ user }, 201);
  });

  r.post('/login', async (c) => {
    const input = await parseBody(c, loginSchema);
    const { user, token } = await services.auth.login(input);
    setSessionCookie(c, token);
    issueCsrfToken(c);
    return c.json({ user }, 200);
  });

  r.post('/logout', requireCsrf, (c) => {
    const token = getSessionToken(c);
    if (token) services.auth.logout(token);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  r.get('/me', requireAuth(db), (c) => {
    const user = services.auth.me(c.get('actor').id);
    if (!user) throw unauthenticated();
    return c.json({ user });
  });

  // ── Recuperación por pregunta de seguridad (sin email) ──
  r.get('/recovery/:alias', (c) => {
    const parsed = aliasSchema.safeParse(c.req.param('alias'));
    // Un alias inválido y uno inexistente responden igual: nada que aprender acá.
    if (!parsed.success) throw notFound('No encontramos una cuenta con ese alias.');
    return c.json({ question: services.auth.recoveryQuestion(parsed.data) });
  });

  r.post('/recovery', async (c) => {
    const input = await parseBody(c, recoverySchema);
    await services.auth.recoveryReset(input);
    return c.json({ ok: true });
  });

  return r;
}
