import type { WineType } from '@bv/shared';
import { WINE_TYPES, WINE_TYPE_LABELS } from '@bv/shared';
import { cn } from '../lib/cn';

const TYPE_DOT: Record<WineType, string> = {
  tinto: 'var(--wine-tinto)',
  blanco: 'var(--wine-blanco)',
  rosado: 'var(--wine-rosado)',
  espumante: 'var(--wine-espumante)',
  naranjo: 'var(--wine-naranjo)',
  dulce: 'var(--wine-dulce)',
};

interface WineTypeSelectProps {
  value: WineType | null;
  onChange: (type: WineType) => void;
  /** Incluye el botón "Todos" (para filtrar). En el form no se usa. */
  includeAll?: boolean;
  onClear?: () => void;
}

/** Segmented control scrolleable con los 6 tipos, cada uno con su punto de color. */
export function WineTypeSelect({ value, onChange, includeAll, onClear }: WineTypeSelectProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: role=group en un contenedor scrolleable de botones.
    <div className="flex gap-2 overflow-x-auto pb-3" role="group" aria-label="Tipo de vino">
      {includeAll && (
        <button
          type="button"
          onClick={onClear}
          aria-pressed={value === null}
          className={cn(
            'h-11 shrink-0 rounded-full border px-3 text-sm transition-colors',
            value === null
              ? 'border-primary bg-primary-soft text-fg'
              : 'border-border bg-surface text-muted hover:bg-surface-2',
          )}
        >
          Todos
        </button>
      )}
      {WINE_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          aria-pressed={value === type}
          className={cn(
            'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
            value === type
              ? 'border-primary bg-primary-soft text-fg'
              : 'border-border bg-surface text-muted hover:bg-surface-2',
          )}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: TYPE_DOT[type] }}
            aria-hidden="true"
          />
          {WINE_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}
