import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/** Carga y valida variables de entorno. Si falta una requerida en prod, no arranca. */

// Un solo .env en la raíz del monorepo. La ruta se resuelve desde este archivo y
// no desde `cwd`, para que `pnpm dev`, `pnpm db:seed` y los tests lean el mismo.
// En producción no existe: las variables las inyecta el host (Railway).
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const DEV_SECRET = 'dev-insecure-secret-change-me';
const MIN_SECRET_LENGTH = 16;

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : Number(v)))
    .pipe(z.number().finite());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    // 3100 y no 3000: las apps hermanas (bv-my-investments) usan 3000 en dev y
    // conviene poder correr las dos a la vez.
    PORT: num(3100),
    DATABASE_PATH: z.string().default('./data/dev.db'),
    UPLOAD_DIR: z.string().default('./data/uploads'),

    SESSION_SECRET: z.string().default(DEV_SECRET),
    SESSION_TTL_DAYS: num(30),
    COOKIE_SECURE: bool(false),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),

    REGISTER_ENABLED: bool(true),
    MAX_USERS: num(10),
    /** Alias que recibe is_admin=1 al registrarse. Vacío = no hay admin. */
    ADMIN_ALIAS: z
      .string()
      .default('')
      .transform((s) => s.trim().toLowerCase()),

    MAX_UPLOAD_BYTES: num(6 * 1024 * 1024),
    UPLOAD_RATE_LIMIT_MAX: num(20),

    RATE_LIMIT_WINDOW_MS: num(60_000),
    RATE_LIMIT_MAX: num(120),
    AUTH_RATE_LIMIT_MAX: num(10),
    LOGIN_MAX_ATTEMPTS: num(8),
    LOGIN_LOCK_MINUTES: num(15),

    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV !== 'production') return;
    if (cfg.SESSION_SECRET === DEV_SECRET || cfg.SESSION_SECRET.length < MIN_SECRET_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET es obligatorio y seguro en producción (openssl rand -hex 32).',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Configuración inválida:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
/** En prod la cookie es secure sí o sí, aunque la env diga lo contrario. */
export const cookieSecure = env.COOKIE_SECURE || isProd;
