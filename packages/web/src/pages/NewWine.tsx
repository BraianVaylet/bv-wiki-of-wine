import type { CreateWineInput } from '@bv/shared';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { WineForm } from '../components/WineForm';
import { useCreateWine } from '../hooks/useWines';
import { ApiError } from '../lib/apiClient';

const CONFLICT_STATUS = 409;

/** Carga un vino. Al guardar, va directo a reseñarlo (CU-4). */
export function NewWine() {
  const navigate = useNavigate();
  const createWine = useCreateWine();

  function onSubmit(input: CreateWineInput) {
    createWine.mutate(input, {
      onSuccess: (wine) => navigate(`/wines/${wine.id}?review=1`),
      onError: (err) => {
        // Si el vino ya existe, ofrecemos ir a reseñarlo en vez de bloquear.
        if (err instanceof ApiError && err.status === CONFLICT_STATUS) {
          const wineId = err.details?.find((d) => d.path === 'wineId')?.message;
          if (wineId) navigate(`/wines/${wineId}`);
        }
      },
    });
  }

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-4">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-muted text-sm hover:text-fg">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver
      </Link>
      <h1 className="mb-4 font-semibold text-fg text-xl">Cargar un vino</h1>
      <WineForm
        submitLabel="Guardar y reseñar"
        loading={createWine.isPending}
        submitError={createWine.error}
        onSubmit={onSubmit}
      />
    </main>
  );
}
