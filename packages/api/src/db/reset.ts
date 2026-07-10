import { existsSync, rmSync } from 'node:fs';
import { env } from '../env';

/** Borra el archivo SQLite y sus sidecars WAL. Bloqueado en producción. */
function reset(): void {
  if (env.NODE_ENV === 'production') {
    console.error('❌ db:reset está deshabilitado en producción.');
    process.exit(1);
  }
  if (env.DATABASE_PATH === ':memory:') {
    console.log('DATABASE_PATH es :memory:, nada que borrar.');
    return;
  }
  for (const suffix of ['', '-shm', '-wal']) {
    const file = env.DATABASE_PATH + suffix;
    if (existsSync(file)) {
      rmSync(file);
      console.log(`🗑️  Borrado ${file}`);
    }
  }
  console.log('✅ Base reseteada. Corré "pnpm db:seed" para recargar.');
}

reset();
