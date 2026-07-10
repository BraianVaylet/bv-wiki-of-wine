import type { DB } from './db/connection';

/** Quien ejecuta una acción. Sale SIEMPRE de la sesión, nunca del body. */
export interface Actor {
  id: number;
  isAdmin: boolean;
}

/** Variables que viven en el contexto de Hono. */
export type Variables = {
  actor: Actor;
  db: DB;
};

/** Entorno tipado de Hono usado en toda la app (middlewares + routers). */
export type AppEnv = { Variables: Variables };
