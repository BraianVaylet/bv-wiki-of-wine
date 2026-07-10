import { WINE_TYPE_LABELS } from '@bv/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { BottleGlyph } from '../components/BottleGlyph';
import { StarRatingDisplay } from '../components/StarRating';
import { Alert, Button, EmptyState, WineCardSkeleton } from '../components/ui';
import { useMyReviews } from '../hooks/useReviews';

const SKELETON_KEYS = ['s1', 's2', 's3'];

type Sort = 'rating' | 'recent';

/** Mis reseñas: responde "¿esto ya lo tomamos y me gustó?" (CU-8). */
export function MyReviews() {
  const [sort, setSort] = useState<Sort>('rating');
  const query = useMyReviews(sort);
  const items = query.data?.items ?? [];

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-fg text-xl">Mis reseñas</h1>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {(['rating', 'recent'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSort(option)}
              className={
                sort === option
                  ? 'rounded-md bg-primary-soft px-3 py-1 text-fg text-sm'
                  : 'px-3 py-1 text-muted text-sm'
              }
            >
              {option === 'rating' ? 'Mejor' : 'Recientes'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {query.isPending && SKELETON_KEYS.map((key) => <WineCardSkeleton key={key} />)}

        {query.isError && <Alert variant="danger">No se pudieron cargar tus reseñas.</Alert>}

        {query.isSuccess && items.length === 0 && (
          <EmptyState
            title="Todavía no puntuaste ningún vino"
            description="Cuando reseñes uno, va a aparecer acá."
            illustration={<BottleGlyph type="tinto" className="h-16 w-16" />}
            action={<Button to="/">Ver el catálogo</Button>}
          />
        )}

        {items.map((review) => (
          <Link
            key={review.id}
            to={`/wines/${review.wine.id}`}
            className="flex gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
              {review.wine.photoUrl ? (
                <img
                  src={review.wine.photoUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <BottleGlyph type={review.wine.type} className="h-full w-full p-1.5" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="truncate font-semibold text-fg">{review.wine.name}</h3>
              <p className="truncate text-muted text-sm">
                {[review.wine.winery?.name, WINE_TYPE_LABELS[review.wine.type]]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className="mt-auto">
                <StarRatingDisplay value={review.overall} size={16} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
