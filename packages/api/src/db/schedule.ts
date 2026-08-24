import { env } from '../env';
import { runBackup } from './backup';
import type { DB } from './connection';
import { s3ConfigFromEnv, uploadBackupSet } from './remote';

/**
 * Backup periódico dentro del proceso de la API.
 *
 * No es un servicio de cron aparte porque **Railway no permite montar un volumen
 * en más de un servicio**: cualquier proceso externo vería un `/data` vacío. El
 * proceso que sirve la app es el único que tiene la base y las fotos, así que el
 * scheduler vive acá.
 *
 * Es seguro: `db.backup()` es la API de backup online de SQLite y tolera
 * escrituras concurrentes, así que no hay que frenar el server para correrlo.
 */

const HOUR_MS = 3_600_000;
/** Primera corrida diferida: que no caiga en medio del arranque de un deploy. */
const FIRST_RUN_DELAY_MS = 5 * 60_000;

let running = false;

/**
 * Una corrida. **Nunca tira**: un backup fallido no puede voltear el server que
 * está sirviendo la app.
 */
export async function runScheduledBackup(db: DB): Promise<boolean> {
  if (running) {
    console.warn('⏭️  Backup anterior todavía corriendo, se saltea este ciclo.');
    return false;
  }
  running = true;
  try {
    // Guarda contra el peor caso: si el volumen se desmontó, la app arranca con
    // una base vacía. Subir ese backup "válido" y vacío empujaría a los buenos
    // fuera de la retención — perder los datos dos veces, la segunda para siempre.
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    if (n === 0) {
      console.error('🚨 Base sin usuarios: NO se hace backup. ¿El volumen está montado?');
      return false;
    }

    const { manifest, dir } = await runBackup({ db });
    const remote = s3ConfigFromEnv();
    if (remote) {
      await uploadBackupSet(remote, dir, manifest);
      console.log(`☁️  Backup ${manifest.stamp} subido a ${remote.bucket}/${remote.prefix}/`);
    } else {
      console.warn(`💾 Backup ${manifest.stamp} solo local: no hay BACKUP_S3_* configurado.`);
    }
    return true;
  } catch (err) {
    console.error('❌ Backup programado fallido:', err instanceof Error ? err.message : err);
    return false;
  } finally {
    running = false;
  }
}

/** Arranca el ciclo. Devuelve `null` si está apagado (`BACKUP_SCHEDULE_HOURS=0`). */
export function startBackupSchedule(db: DB): NodeJS.Timeout | null {
  const hours = env.BACKUP_SCHEDULE_HOURS;
  if (hours <= 0) {
    console.warn('⚠️  BACKUP_SCHEDULE_HOURS=0: no hay backups automáticos.');
    return null;
  }

  // `unref` en los dos: son tareas de fondo, no razones para mantener vivo el
  // proceso cuando Railway manda SIGTERM.
  setTimeout(() => void runScheduledBackup(db), FIRST_RUN_DELAY_MS).unref();
  const timer = setInterval(() => void runScheduledBackup(db), hours * HOUR_MS);
  timer.unref();

  console.log(`🗓️  Backup automático cada ${hours} h (primera corrida en 5 min).`);
  return timer;
}
