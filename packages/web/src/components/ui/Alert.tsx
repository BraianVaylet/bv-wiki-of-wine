import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'danger' | 'info';

const VARIANTS: Record<Variant, string> = {
  danger: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-border bg-surface-2 text-fg',
};

/** Mensaje a nivel de bloque. Los de error se anuncian solos (`role="alert"`). */
export function Alert({
  variant = 'info',
  children,
}: {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <div
      role={variant === 'danger' ? 'alert' : undefined}
      className={cn('rounded-lg border px-3 py-2 text-sm', VARIANTS[variant])}
    >
      {children}
    </div>
  );
}
