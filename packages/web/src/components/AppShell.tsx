import { LogOut, Star, Wine } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useLogout } from '../auth/useAuth';
import { cn } from '../lib/cn';
import { AccentMenu } from './AccentMenu';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const ICON_SIZE = 18;
const NAV_ICON_SIZE = 20;

const NAV_ITEMS = [
  { to: '/', label: 'Vinos', icon: Wine, end: true },
  { to: '/me/reviews', label: 'Mis reseñas', icon: Star, end: false },
];

/** Header arriba + tab bar inferior. El contenido tiene padding para no taparse. */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-border border-b bg-bg/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Logo className="h-9 w-9 rounded-md" />
          <span className="font-semibold text-fg">Wiki of Wine</span>
        </div>
        <div className="flex items-center gap-2">
          <AccentMenu />
          <ThemeToggle />
          <button
            type="button"
            aria-label="Cerrar sesión"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-fg transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <LogOut size={ICON_SIZE} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-24">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-border border-t bg-surface"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navegación principal"
      >
        <div className="mx-auto flex max-w-2xl">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-muted hover:text-fg',
                )
              }
            >
              <Icon size={NAV_ICON_SIZE} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
