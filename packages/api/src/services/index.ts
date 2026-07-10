import type { DB } from '../db/connection';
import { now as defaultNow } from '../lib/time';
import { type AuthConfig, authConfigFromEnv, createAuthService } from './authService';
import { createReviewService } from './reviewService';
import { createWineService } from './wineService';

/** Dependencias inyectables. `now` mockeable hace deterministas los tests. */
export interface ServiceDeps {
  now?: () => number;
  authConfig?: Partial<AuthConfig>;
}

export function createServices(db: DB, deps: ServiceDeps = {}) {
  const now = deps.now ?? defaultNow;
  const authConfig: AuthConfig = { ...authConfigFromEnv(), ...deps.authConfig };
  return {
    auth: createAuthService(db, now, authConfig),
    wines: createWineService(db, now),
    reviews: createReviewService(db, now),
  };
}

export type Services = ReturnType<typeof createServices>;
