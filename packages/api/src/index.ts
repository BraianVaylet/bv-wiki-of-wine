import { serve } from '@hono/node-server';
import { createApp } from './app';
import { getDb } from './db/connection';
import { env, isProd } from './env';
import { now } from './lib/time';
import { sessionRepo } from './repositories/sessionRepo';
import { mountStatic } from './static';

const db = getDb();
sessionRepo.sweepExpired(db, now());

const app = createApp(db);

// En producción, esta misma app sirve la SPA buildeada.
if (isProd) {
  mountStatic(app);
}

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🍷 Wiki of Wine API en http://localhost:${info.port} (${env.NODE_ENV})`);
});

// Sin esto, un EADDRINUSE se emite como evento del server, nadie lo escucha y el
// proceso queda vivo sin escuchar nada: arranque roto, cero output. Fallar fuerte.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ El puerto ${env.PORT} ya está en uso. Cambiá PORT en .env.`);
  } else {
    console.error('❌ El servidor no pudo arrancar:', err.message);
  }
  process.exit(1);
});
