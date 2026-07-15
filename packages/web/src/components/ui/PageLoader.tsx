import { Spinner } from '@medano-ui/react';

/** Fallback de `Suspense` mientras baja el chunk de una ruta. */
export function PageLoader() {
  return (
    <div className="flex min-h-full items-center justify-center text-muted" aria-busy="true">
      <Spinner size="lg" label="Cargando…" />
    </div>
  );
}
