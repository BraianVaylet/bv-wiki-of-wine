import type { LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Label({ className, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // Primitivo genérico: los callers pasan `htmlFor`. La regla no puede verlo.
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor lo aporta quien lo usa.
    <label className={cn('mb-1 block font-medium text-fg text-sm', className)} {...rest}>
      {children}
    </label>
  );
}
