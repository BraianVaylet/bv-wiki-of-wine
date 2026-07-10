import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/** algorithm: 2 = argon2id. */
const OPTS = { algorithm: 2 } as const;

/** Hash de contraseña con argon2id. */
export function hashSecret(plain: string): Promise<string> {
  return argonHash(plain, OPTS);
}

/** Verifica un secreto contra su hash. Nunca lanza: un hash corrupto es `false`. */
export async function verifySecret(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain, OPTS);
  } catch {
    return false;
  }
}

/**
 * Hash dummy para igualar el tiempo de respuesta cuando el alias no existe.
 * Sin esto, un login contra un alias inexistente responde mucho más rápido que
 * uno con contraseña incorrecta, y eso enumera usuarios.
 */
let dummy: string | null = null;
export async function getDummyHash(): Promise<string> {
  if (!dummy) dummy = await hashSecret('timing-attack-mitigation-dummy');
  return dummy;
}
