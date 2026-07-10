import type { ApiError } from '@bv/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { DB } from './db/connection';
import { env, isProd } from './env';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';
import { rateLimit } from './middleware/rateLimit';
import { apiCacheControl, bodyLimit, securityHeaders } from './middleware/security';
import { authRoutes } from './routes/auth';
import { catalogRoutes } from './routes/catalog';
import { healthRoutes } from './routes/health';
import { photoRoutes } from './routes/photo';
import { meRoutes, wineRoutes } from './routes/wines';
import { type ServiceDeps, createServices } from './services';
import type { AppEnv } from './types';

/**
 * Topes de rate limit. Los tests los suben: ejercitar el bloqueo por intentos
 * fallidos requiere más requests de auth de las que el limiter permite por
 * minuto, y si no se separan, un test de login choca contra el limiter y
 * miente sobre qué se está probando.
 */
export interface RateLimits {
  global: number;
  auth: number;
}

export interface AppDeps extends ServiceDeps {
  rateLimits?: Partial<RateLimits>;
}

/** Construye la app Hono. Recibe la DB y las deps para permitir inyección en tests. */
export function createApp(db: DB, deps: AppDeps = {}) {
  const services = createServices(db, deps);
  const limits: RateLimits = {
    global: env.RATE_LIMIT_MAX,
    auth: env.AUTH_RATE_LIMIT_MAX,
    ...deps.rateLimits,
  };
  const app = new Hono<AppEnv>();

  app.onError(errorHandler);

  app.use('*', securityHeaders);
  app.use('*', bodyLimit());
  app.use('*', rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: limits.global }));

  // CORS solo en dev: en prod el front se sirve del mismo origen.
  if (!isProd) {
    app.use('/api/*', cors({ origin: env.CORS_ORIGIN, credentials: true }));
  }

  const api = new Hono<AppEnv>();

  // Auth con su propio límite, más estricto: es la puerta de entrada.
  api.use(
    '/auth/*',
    rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: limits.auth, prefix: 'auth' }),
  );
  api.route('/auth', authRoutes(db, services));
  api.route('/health', healthRoutes(db));

  // ── API protegida (requiere sesión). El actor sale de la cookie, no del body. ──
  const protectedApi = new Hono<AppEnv>();
  protectedApi.use('*', requireAuth(db));
  protectedApi.route('/wines', wineRoutes(services));
  protectedApi.route('/wines', photoRoutes(services));
  protectedApi.route('/me', meRoutes(services));
  protectedApi.route('/', catalogRoutes(db));
  api.route('/', protectedApi);

  app.use('/api/*', apiCacheControl);
  app.route('/api', api);

  // Una ruta de API inexistente debe responder con la forma de error del contrato,
  // no con el texto plano de Hono: el cliente parsea `{ error: { code, message } }`.
  // Las rutas no-API las atiende mountStatic (fallback a index.html) en producción.
  app.notFound((c) => {
    if (!c.req.path.startsWith('/api')) return c.text('Not found', 404);
    const body: ApiError = { error: { code: 'NOT_FOUND', message: 'Esa ruta no existe.' } };
    return c.json(body, 404);
  });

  return app;
}
