import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

const ICON_SIZE = 18;

/** Botón para alternar tema claro/oscuro. */
export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === 'dark';
  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-fg transition-colors hover:bg-surface-2"
    >
      {isDark ? <Sun size={ICON_SIZE} /> : <Moon size={ICON_SIZE} />}
    </button>
  );
}
