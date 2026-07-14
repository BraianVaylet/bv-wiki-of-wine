import type { WineType } from '@bv/shared';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { BottleGlyph } from '../components/BottleGlyph';
import { WineCard } from '../components/WineCard';
import { WineTypeSelect } from '../components/WineTypeSelect';
import { Alert, Button, EmptyState, WineCardSkeleton } from '../components/ui';
import { type WineFilters, useWines } from '../hooks/useWines';

const SKELETON_KEYS = ['s1', 's2', 's3', 's4'];
const FAB_ICON_SIZE = 24;

export function Wines() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<WineType | null>(null);
  const filters: WineFilters = { query: query.trim() || undefined, type: type ?? undefined };
  const wines = useWines(filters);

  const items = wines.data?.pages.flatMap((page) => page.items) ?? [];
  const hasFilters = Boolean(filters.query || filters.type);

  return (
    <AppShell>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={18}
            className="-translate-y-1/2 absolute top-1/2 left-3 text-dim"
            aria-hidden="true"
          />
          {/* Input crudo con la clase de medano: el Input de la librería exige
              label visible y acá el nombre accesible lo da aria-label (gap
              anotado en medano-ui/docs/GAPS.md). */}
          <input
            type="search"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar vino o bodega…"
            aria-label="Buscar vino o bodega"
            autoComplete="off"
            enterKeyHint="search"
            className="medano-field__input pl-10"
          />
        </div>

        <WineTypeSelect value={type} onChange={setType} includeAll onClear={() => setType(null)} />

        {wines.isPending && (
          <div className="flex flex-col gap-3">
            {SKELETON_KEYS.map((key) => (
              <WineCardSkeleton key={key} />
            ))}
          </div>
        )}

        {wines.isError && (
          <Alert variant="danger">
            No se pudo cargar el catálogo.{' '}
            <button type="button" onClick={() => wines.refetch()} className="underline">
              Reintentar
            </button>
          </Alert>
        )}

        {wines.isSuccess && items.length === 0 && !hasFilters && (
          <EmptyState
            title="Todavía no hay vinos"
            description="Cargá el primero que hayan probado."
            illustration={<BottleGlyph type="tinto" className="h-16 w-16" />}
            action={<Button to="/wines/new">Cargar el primero</Button>}
          />
        )}

        {wines.isSuccess && items.length === 0 && hasFilters && (
          <EmptyState
            title="Ningún vino coincide"
            description="Probá con otra búsqueda o quitá los filtros."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setType(null);
                }}
              >
                Limpiar filtros
              </Button>
            }
          />
        )}

        {items.map((wine) => (
          <WineCard key={wine.id} wine={wine} />
        ))}

        {wines.hasNextPage && (
          <Button
            variant="secondary"
            loading={wines.isFetchingNextPage}
            onClick={() => wines.fetchNextPage()}
          >
            Ver más
          </Button>
        )}
      </div>

      <Link
        to="/wines/new"
        aria-label="Cargar vino"
        className="fixed right-5 bottom-20 z-20 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-colors hover:bg-primary-strong"
      >
        <Plus size={FAB_ICON_SIZE} aria-hidden="true" />
      </Link>
    </AppShell>
  );
}
