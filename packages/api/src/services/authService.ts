import {
  type LoginInput,
  type PublicUser,
  type RecoveryInput,
  type RegisterInput,
  normalizeAnswer,
  questionById,
} from '@bv/shared';
import type { DB } from '../db/connection';
import { env } from '../env';
import { conflict, forbidden, notFound, rateLimited, unauthenticated } from '../lib/errors';
import { getDummyHash, hashSecret, verifySecret } from '../lib/hash';
import { now as defaultNow } from '../lib/time';
import { hmac, randomToken } from '../lib/tokens';
import { sessionRepo } from '../repositories/sessionRepo';
import { type UserRecord, toPublicUser, userRepo } from '../repositories/userRepo';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/** Mensaje único ante alias inexistente o contraseña mala: no enumera usuarios. */
const BAD_CREDENTIALS = 'Alias o contraseña incorrectos.';

/** Código de better-sqlite3 cuando choca un índice único. */
const SQLITE_UNIQUE = 'SQLITE_CONSTRAINT_UNIQUE';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === SQLITE_UNIQUE
  );
}

export interface AuthSession {
  user: PublicUser;
  token: string;
}

/**
 * Política de auth. Se inyecta en vez de leer `env` adentro: así un test puede
 * cerrar el registro o bajar `maxUsers` sin tocar `process.env`.
 */
export interface AuthConfig {
  registerEnabled: boolean;
  maxUsers: number;
  adminAlias: string;
  sessionTtlDays: number;
  loginMaxAttempts: number;
  loginLockMinutes: number;
}

export const authConfigFromEnv = (): AuthConfig => ({
  registerEnabled: env.REGISTER_ENABLED,
  maxUsers: env.MAX_USERS,
  adminAlias: env.ADMIN_ALIAS,
  sessionTtlDays: env.SESSION_TTL_DAYS,
  loginMaxAttempts: env.LOGIN_MAX_ATTEMPTS,
  loginLockMinutes: env.LOGIN_LOCK_MINUTES,
});

/** `now` es inyectable para que los tests no dependan del reloj. */
export function createAuthService(
  db: DB,
  now: () => number = defaultNow,
  config: AuthConfig = authConfigFromEnv(),
) {
  function startSession(user: UserRecord): AuthSession {
    const token = randomToken();
    const ts = now();
    sessionRepo.create(db, hmac(token), user.id, ts + config.sessionTtlDays * MS_PER_DAY, ts);
    return { user: toPublicUser(user), token };
  }

  return {
    aliasAvailable(alias: string): boolean {
      return userRepo.findByAlias(db, alias) === null;
    },

    async register(input: RegisterInput): Promise<AuthSession> {
      if (!config.registerEnabled) {
        throw forbidden('El registro está cerrado por ahora.');
      }
      if (userRepo.count(db) >= config.maxUsers) {
        throw forbidden('Se alcanzó el máximo de usuarios.');
      }
      if (!questionById(input.securityQuestionId)) {
        throw notFound('Esa pregunta de seguridad no existe.');
      }

      const [passwordHash, securityAnswerHash] = await Promise.all([
        hashSecret(input.password),
        hashSecret(normalizeAnswer(input.securityAnswer)),
      ]);

      try {
        const user = userRepo.create(db, {
          alias: input.alias,
          passwordHash,
          securityQuestionId: input.securityQuestionId,
          securityAnswerHash,
          // El primer usuario que se registre con ADMIN_ALIAS es el admin.
          isAdmin: config.adminAlias !== '' && input.alias === config.adminAlias,
          createdAt: now(),
        });
        return startSession(user);
      } catch (err) {
        // Dos registros simultáneos del mismo alias: gana el índice único.
        if (isUniqueViolation(err)) throw conflict('Ese alias ya está tomado.');
        throw err;
      }
    },

    async login(input: LoginInput): Promise<AuthSession> {
      const user = userRepo.findByAlias(db, input.alias);

      // Verificar contra un hash dummy iguala el tiempo de respuesta cuando el
      // alias no existe. Sin esto, la latencia delata qué alias están tomados.
      if (!user) {
        await verifySecret(await getDummyHash(), input.password);
        throw unauthenticated(BAD_CREDENTIALS);
      }

      if (user.lockedUntil !== null && user.lockedUntil > now()) {
        const minutes = Math.ceil((user.lockedUntil - now()) / MS_PER_MINUTE);
        throw rateLimited(`Demasiados intentos. Probá de nuevo en ${minutes} min.`);
      }

      if (!(await verifySecret(user.passwordHash, input.password))) {
        const attempts = userRepo.registerFailedAttempt(db, user.id);
        if (attempts >= config.loginMaxAttempts) {
          userRepo.lockUntil(db, user.id, now() + config.loginLockMinutes * MS_PER_MINUTE);
        }
        throw unauthenticated(BAD_CREDENTIALS);
      }

      userRepo.clearLock(db, user.id);
      return startSession(user);
    },

    logout(token: string): void {
      sessionRepo.delete(db, hmac(token));
    },

    me(userId: number): PublicUser | null {
      const user = userRepo.findById(db, userId);
      return user ? toPublicUser(user) : null;
    },

    /** Devuelve la pregunta de seguridad del alias. 404 neutro si no existe. */
    recoveryQuestion(alias: string): string {
      const user = userRepo.findByAlias(db, alias);
      const question = user && questionById(user.securityQuestionId);
      if (!question) throw notFound('No encontramos una cuenta con ese alias.');
      return question.text;
    },

    async recoveryReset(input: RecoveryInput): Promise<void> {
      const user = userRepo.findByAlias(db, input.alias);
      if (!user) {
        await verifySecret(await getDummyHash(), input.answer);
        throw notFound('No encontramos una cuenta con ese alias.');
      }
      if (!(await verifySecret(user.securityAnswerHash, normalizeAnswer(input.answer)))) {
        throw unauthenticated('La respuesta no coincide.');
      }

      userRepo.updatePassword(db, user.id, await hashSecret(input.newPassword));
      // Cambiar la contraseña echa a quien estuviera adentro con la vieja.
      sessionRepo.deleteAllForUser(db, user.id);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
