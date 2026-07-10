import type { DB } from '../db/connection';
import type { Actor } from '../types';

/** Lo que la sesión resuelve: quién sos y si sos admin. */
interface ActorRow {
  id: number;
  is_admin: number;
}

export const sessionRepo = {
  /** Guarda el HMAC del token, nunca el token en claro. */
  create(db: DB, tokenHash: string, userId: number, expiresAt: number, createdAt: number): void {
    db.prepare(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    ).run(tokenHash, userId, expiresAt, createdAt);
  },

  /**
   * Resuelve el actor a partir del hash del token. Borra la sesión si venció:
   * una sesión expirada no debe seguir ocupando lugar ni poder resucitar.
   */
  findActor(db: DB, tokenHash: string, now: number): Actor | null {
    const row = db
      .prepare(
        `SELECT u.id AS id, u.is_admin AS is_admin, s.expires_at AS expires_at
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?`,
      )
      .get(tokenHash) as (ActorRow & { expires_at: number }) | undefined;

    if (!row) return null;
    if (row.expires_at < now) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    return { id: row.id, isAdmin: row.is_admin === 1 };
  },

  delete(db: DB, tokenHash: string): void {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  },

  /** Cierra todas las sesiones de un usuario (tras recuperar la contraseña). */
  deleteAllForUser(db: DB, userId: number): void {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },

  /** Housekeeping al arrancar: saca las vencidas. */
  sweepExpired(db: DB, now: number): void {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  },
};
