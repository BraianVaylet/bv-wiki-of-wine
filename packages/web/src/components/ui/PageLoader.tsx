import { Spinner } from './Spinner';

const SPINNER_SIZE = 28;

/** Fallback de `Suspense` mientras baja el chunk de una ruta. */
export function PageLoader() {
  return (
    <div className="flex min-h-full items-center justify-center text-muted" aria-busy="true">
      <Spinner size={SPINNER_SIZE} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
