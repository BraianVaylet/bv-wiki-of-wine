import { Button as MedanoButton, type ButtonProps as MedanoButtonProps } from '@medano-ui/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

interface ButtonProps extends MedanoButtonProps {
  /** Si se pasa, el botón se renderiza como un `<Link>` de react-router. */
  to?: string;
}

/**
 * Adapter sobre medano-ui. El caso `to` renderiza un Link con las clases CSS
 * públicas de medano (Button no acepta render prop todavía — anotado en
 * GAPS.md de la librería).
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  to,
  ...rest
}: ButtonProps) {
  if (to) {
    return (
      <Link
        to={to}
        className={cn('medano-button', className)}
        data-variant={variant}
        data-size={size}
      >
        {children as ReactNode}
      </Link>
    );
  }

  return (
    <MedanoButton variant={variant} size={size} className={className} type={type} {...rest}>
      {children}
    </MedanoButton>
  );
}
