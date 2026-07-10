import { cn } from '../../lib/cn';

/** Bloque de carga. Con la forma del contenido real evita el salto de layout. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden="true" />
  );
}

/** Skeleton con la forma de una WineCard (imagen + 3 líneas). */
export function WineCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-surface p-3">
      <Skeleton className="h-20 w-20 shrink-0" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-auto h-4 w-24" />
      </div>
    </div>
  );
}
