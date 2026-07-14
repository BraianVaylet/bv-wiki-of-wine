import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { ACCENTS } from '../theme/accent';

/** Selector de color de acento (mismo que bv-personal-finances / bv-my-investments). */
export function AccentMenu() {
  const { accent, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Color de acento"
        aria-expanded={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface hover:bg-surface-2"
      >
        <span className="h-4 w-4 rounded-full" style={{ background: 'var(--primary)' }} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 flex gap-2 rounded-lg border border-border bg-surface p-2 shadow-lg">
          {ACCENTS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-label={option.label}
              onClick={() => {
                setAccent(option.hex);
                setOpen(false);
              }}
              className="h-8 w-8 rounded-full border-2"
              style={{
                background: option.hex,
                borderColor:
                  accent?.toLowerCase() === option.hex.toLowerCase() ? 'var(--fg)' : 'transparent',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
