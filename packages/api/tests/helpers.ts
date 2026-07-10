import type { Hono } from 'hono';
import { type AppDeps, createApp } from '../src/app';
import { type DB, createDb } from '../src/db/connection';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/lib/csrf';
import { SESSION_COOKIE } from '../src/lib/session';
import type { AppEnv } from '../src/types';

/** Sin tope de rate limit salvo que el test lo pida: acá se prueba otra cosa. */
const TEST_RATE_LIMITS = { global: 10_000, auth: 10_000 };

/**
 * DB real en memoria: aplica el esquema completo y ejercita las constraints de
 * verdad (UNIQUE, CHECK, CASCADE). Mockear el repositorio testearía el mock.
 */
export function testDb(): DB {
  return createDb(':memory:');
}

export interface TestApp {
  db: DB;
  app: Hono<AppEnv>;
}

export function testApp(deps: AppDeps = {}): TestApp {
  const db = testDb();
  return { db, app: createApp(db, { rateLimits: TEST_RATE_LIMITS, ...deps }) };
}

/** Cliente mínimo que arrastra cookies entre requests, como un browser. */
export class TestClient {
  private cookies = new Map<string, string>();

  constructor(private app: Hono<AppEnv>) {}

  get sessionToken(): string | undefined {
    return this.cookies.get(SESSION_COOKIE);
  }

  get csrfToken(): string {
    return this.cookies.get(CSRF_COOKIE) ?? '';
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private absorbSetCookie(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const pair = raw.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq < 1) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      // `Max-Age=0` / valor vacío = el server la está borrando.
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(
    path: string,
    init: { method?: string; body?: unknown; csrf?: boolean } = {},
  ): Promise<Response> {
    const method = init.method ?? 'GET';
    const headers: Record<string, string> = {};
    const cookies = this.cookieHeader();
    if (cookies) headers.cookie = cookies;
    if (init.body !== undefined) headers['content-type'] = 'application/json';

    // Por defecto mandamos el CSRF en mutaciones (un browser bien portado);
    // `csrf: false` simula el ataque cross-site.
    const wantsCsrf = init.csrf ?? method !== 'GET';
    const csrfToken = this.cookies.get(CSRF_COOKIE);
    if (wantsCsrf && csrfToken) headers[CSRF_HEADER] = csrfToken;

    const res = await this.app.request(path, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    this.absorbSetCookie(res);
    return res;
  }

  get = (path: string) => this.request(path);
  post = (path: string, body?: unknown, csrf?: boolean) =>
    this.request(path, { method: 'POST', body, csrf });
  put = (path: string, body?: unknown, csrf?: boolean) =>
    this.request(path, { method: 'PUT', body, csrf });
  patch = (path: string, body?: unknown, csrf?: boolean) =>
    this.request(path, { method: 'PATCH', body, csrf });
  del = (path: string, csrf?: boolean) => this.request(path, { method: 'DELETE', csrf });
}

export const VALID_PASSWORD = 'una-contrasena-larga';

export function registerPayload(alias: string, overrides: Record<string, unknown> = {}) {
  return {
    alias,
    password: VALID_PASSWORD,
    securityQuestionId: 3,
    securityAnswer: 'Firulais',
    ...overrides,
  };
}

/** Registra un usuario y deja al cliente con su sesión activa. */
export async function registerAndLogin(client: TestClient, alias: string): Promise<number> {
  await client.get('/api/auth/csrf');
  const res = await client.post('/api/auth/register', registerPayload(alias));
  const body = (await res.json()) as { user: { id: number } };
  return body.user.id;
}
