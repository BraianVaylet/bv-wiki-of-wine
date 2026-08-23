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
    // Backups locales. Ojo: por defecto viven en el mismo disco que la base, así
    // que protegen contra un borrado accidental, NO contra perder el volumen.
    // Ver docs/08-hosting.md §5.
    BACKUP_DIR: z.string().default('./data/backups'),
    BACKUP_RETENTION_DAYS: num(30),
    // Bucket S3-compatible (B2 / R2 / S3) donde se sube el set. Vacío = solo local.
    // Es lo único que protege contra perder el volumen entero.
    BACKUP_S3_ENDPOINT: z.string().default(''),
    BACKUP_S3_REGION: z.string().default(''),
    BACKUP_S3_BUCKET: z.string().default(''),
    BACKUP_S3_ACCESS_KEY_ID: z.string().default(''),
    BACKUP_S3_SECRET_ACCESS_KEY: z.string().default(''),
    BACKUP_S3_PREFIX: z.string().default('wow'),

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
    // Backup remoto: todo o nada. Media configuración deja `db:backup` subiendo a
    // ningún lado sin avisar, que es el peor resultado posible acá.
    const s3 = {
      BACKUP_S3_ENDPOINT: cfg.BACKUP_S3_ENDPOINT,
      BACKUP_S3_REGION: cfg.BACKUP_S3_REGION,
      BACKUP_S3_BUCKET: cfg.BACKUP_S3_BUCKET,
      BACKUP_S3_ACCESS_KEY_ID: cfg.BACKUP_S3_ACCESS_KEY_ID,
      BACKUP_S3_SECRET_ACCESS_KEY: cfg.BACKUP_S3_SECRET_ACCESS_KEY,
    };
    const missing = Object.entries(s3).filter(([, v]) => !v);
    if (missing.length > 0 && missing.length < Object.keys(s3).length) {
      for (const [key] of missing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Falta para el backup remoto. Completá todas las BACKUP_S3_* o ninguna.',
        });
      }
    }

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
