import { env } from '../env';
import { now } from '../lib/time';
import { listBackups, runBackup } from './backup';
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
/**
 * Chequeo al despertar, diferido lo justo para no competir con el arranque.
 *
 * Corto a propósito: con App Sleeping el contenedor se apaga a los pocos minutos
 * de inactividad. Si esta espera es larga, el proceso muere antes de llegar.
 */
const WAKE_CHECK_DELAY_MS = 45_000;

let running = false;

/**
 * ¿Pasaron `hours` desde el último backup?
 *
 * Es lo que hace que el backup funcione **con App Sleeping encendido**. Un
 * `setInterval` de 24 o 48 h no sirve: exige que el proceso viva esas horas
 * seguidas, y Railway apaga el contenedor a los minutos de inactividad — el
 * timer no llega a dispararse nunca.
 *
 * En vez de eso, cada arranque (o sea, cada vez que alguien entra a la app y la
 * despierta) pregunta cuánto hace del último backup. El despertar es el
 * disparador. Si nadie entra durante días tampoco hay datos nuevos que perder.
 */
export function backupIsDue(dir: string, hours: number, nowMs = now()): boolean {
  const [latest] = listBackups(dir);
  if (!latest) return true;
  return nowMs - latest.at >= hours * HOUR_MS;
}

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

/** Corre un backup solo si toca. El chequeo de antigüedad va contra `BACKUP_DIR`. */
async function backupIfDue(db: DB, hours: number): Promise<void> {
  if (!backupIsDue(env.BACKUP_DIR, hours)) return;
  await runScheduledBackup(db);
}

/** Arranca el ciclo. Devuelve `null` si está apagado (`BACKUP_SCHEDULE_HOURS=0`). */
export function startBackupSchedule(db: DB): NodeJS.Timeout | null {
  const hours = env.BACKUP_SCHEDULE_HOURS;
  if (hours <= 0) {
    console.warn('⚠️  BACKUP_SCHEDULE_HOURS=0: no hay backups automáticos.');
    return null;
  }

  // Dos disparadores, porque ninguno solo alcanza:
  // - al despertar: el único que funciona con App Sleeping, donde el proceso no
  //   vive lo suficiente para que un interval largo llegue a dispararse;
  // - el interval: para cuando el servicio corre 24/7 y nunca se reinicia.
  // Los dos pasan por `backupIsDue`, así que despertarse diez veces en una hora
  // no genera diez backups.
  //
  // `unref` en ambos: son tareas de fondo, no razones para mantener vivo el
  // proceso cuando Railway manda SIGTERM.
  setTimeout(() => void backupIfDue(db, hours), WAKE_CHECK_DELAY_MS).unref();
  const timer = setInterval(() => void backupIfDue(db, hours), hours * HOUR_MS);
  timer.unref();

  console.log(`🗓️  Backup automático cada ${hours} h (se revisa al despertar).`);
  return timer;
}
