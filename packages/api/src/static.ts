import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import type { AppEnv } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Carpeta del build del frontend (packages/web/dist). */
const WEB_DIST = resolve(__dirname, '../../web/dist');

const ONE_YEAR_SECONDS = 31_536_000;
const ONE_DAY_SECONDS = 86_400;

/**
 * Sirve la SPA en producción: assets estáticos + fallback a index.html para que
 * el routing del cliente sobreviva a recargas y deep links.
 */
export function mountStatic(app: Hono<AppEnv>): void {
  if (!existsSync(WEB_DIST)) {
    console.warn(`⚠️  No existe ${WEB_DIST}. Corré "pnpm build" para generar el frontend.`);
    return;
  }

  app.use(
    '/*',
    serveStatic({
      root: WEB_DIST,
      onFound: (path, c) => {
        if (path.includes('/assets/')) {
          // Vite hashea estos nombres → el contenido es inmutable.
          c.header('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
        } else if (
          path.endsWith('sw.js') ||
          path.endsWith('index.html') ||
          path.endsWith('manifest.webmanifest')
        ) {
          // Shell y service worker: revalidar siempre, o un deploy nuevo sirve
          // un HTML viejo que apunta a bundles que ya no existen.
          c.header('Cache-Control', 'no-cache');
        } else {
          c.header('Cache-Control', `public, max-age=${ONE_DAY_SECONDS}`);
        }
      },
    }),
  );

  app.get('*', async (c) => {
    const html = await readFile(join(WEB_DIST, 'index.html'), 'utf-8');
    c.header('Cache-Control', 'no-cache');
    return c.html(html);
  });
}
