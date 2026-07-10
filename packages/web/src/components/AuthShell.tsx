import type { ReactNode } from 'react';
import { AccentMenu } from './AccentMenu';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { Card } from './ui';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Layout centrado para las pantallas de autenticación. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-5 px-5 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10 rounded-md" />
          <span className="font-semibold text-fg text-lg">Wiki of Wine</span>
        </div>
        <div className="flex items-center gap-2">
          <AccentMenu />
          <ThemeToggle />
        </div>
      </header>
      <Card>
        <h1 className="font-semibold text-fg text-xl">{title}</h1>
        {subtitle && <p className="mt-1 mb-4 text-muted text-sm">{subtitle}</p>}
        {children}
      </Card>
      {footer && <div className="text-center text-muted text-sm">{footer}</div>}
    </main>
  );
}
