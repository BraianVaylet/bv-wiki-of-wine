import type { PublicUser } from '@bv/shared';
import type { DB } from '../db/connection';

/** Fila cruda de `users` (snake_case). No sale de este módulo. */
interface UserRow {
  id: number;
  alias: string;
  password_hash: string;
  security_question_id: number;
  security_answer_hash: string;
  is_admin: number;
  failed_attempts: number;
  locked_until: number | null;
  created_at: number;
}

/** Usuario completo para uso interno (incluye hashes). Nunca se serializa. */
export interface UserRecord {
  id: number;
  alias: string;
  passwordHash: string;
  securityQuestionId: number;
  securityAnswerHash: string;
  isAdmin: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  createdAt: number;
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    alias: row.alias,
    passwordHash: row.password_hash,
    securityQuestionId: row.security_question_id,
    securityAnswerHash: row.security_answer_hash,
    isAdmin: row.is_admin === 1,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
  };
}

/** Proyección segura: lo único que puede cruzar el borde de la API. */
export function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, alias: user.alias, isAdmin: user.isAdmin, createdAt: user.createdAt };
}

export interface NewUser {
  alias: string;
  passwordHash: string;
  securityQuestionId: number;
  securityAnswerHash: string;
  isAdmin: boolean;
  createdAt: number;
}

export const userRepo = {
  findByAlias(db: DB, alias: string): UserRecord | null {
    const row = db.prepare('SELECT * FROM users WHERE alias = ?').get(alias) as UserRow | undefined;
    return row ? toUser(row) : null;
  },

  findById(db: DB, id: number): UserRecord | null {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  },

  count(db: DB): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    return row.n;
  },

  create(db: DB, user: NewUser): UserRecord {
    const row = db
      .prepare(
        `INSERT INTO users
           (alias, password_hash, security_question_id, security_answer_hash, is_admin, created_at)
         VALUES (@alias, @passwordHash, @securityQuestionId, @securityAnswerHash, @isAdmin, @createdAt)
         RETURNING *`,
      )
      .get({ ...user, isAdmin: user.isAdmin ? 1 : 0 }) as UserRow;
    return toUser(row);
  },

  /** Suma un intento fallido y devuelve el total. */
  registerFailedAttempt(db: DB, id: number): number {
    const row = db
      .prepare(
        'UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ? RETURNING failed_attempts',
      )
      .get(id) as { failed_attempts: number };
    return row.failed_attempts;
  },

  lockUntil(db: DB, id: number, until: number): void {
    db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').run(until, id);
  },

  /** Login exitoso: se limpia el contador y el bloqueo. */
  clearLock(db: DB, id: number): void {
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(id);
  },

  updatePassword(db: DB, id: number, passwordHash: string): void {
    db.prepare(
      'UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
    ).run(passwordHash, id);
  },
};
