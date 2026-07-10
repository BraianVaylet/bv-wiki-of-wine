import type { WineListItem } from '@bv/shared';
import { WINE_TYPE_LABELS } from '@bv/shared';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BottleGlyph } from './BottleGlyph';
import { GrapeChips } from './GrapeChips';
import { ScoreBadge } from './ScoreBadge';

const CHECK_SIZE = 14;

/** Fila del catálogo: foto/glifo + ficha + puntaje + "ya lo reseñaste". */
export function WineCard({ wine }: { wine: WineListItem }) {
  const meta = [wine.winery?.name, WINE_TYPE_LABELS[wine.type], wine.vintage]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={`/wines/${wine.id}`}
      className="flex gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2"
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        {wine.photoUrl ? (
          <img
            src={wine.photoUrl}
            alt={`Etiqueta de ${wine.name}`}
            loading="lazy"
            decoding="async"
            width={80}
            height={80}
            className="h-full w-full object-cover"
          />
        ) : (
          <BottleGlyph type={wine.type} className="h-full w-full p-2" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold text-fg">{wine.name}</h3>
          {wine.reviewedByMe && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary text-xs"
              title="Ya lo reseñaste"
            >
              <Check size={CHECK_SIZE} aria-hidden="true" />
              <span>reseñado</span>
            </span>
          )}
        </div>
        {meta && <p className="truncate text-muted text-sm">{meta}</p>}
        <GrapeChips grapes={wine.grapes} />
        <div className="mt-auto pt-1">
          <ScoreBadge avg={wine.avgOverall} count={wine.reviewCount} />
        </div>
      </div>
    </Link>
  );
}
