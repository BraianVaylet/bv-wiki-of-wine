import type { CreateWineInput } from '@bv/shared';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { WineForm } from '../components/WineForm';
import { Alert, PageLoader } from '../components/ui';
import { useUpdateWine, useWine } from '../hooks/useWines';

/** Edición de un vino existente. Solo el creador o admin llegan acá (el back valida). */
export function EditWine() {
  const { id } = useParams();
  const wineId = Number(id);
  const navigate = useNavigate();
  const detail = useWine(wineId);
  const updateWine = useUpdateWine(wineId);

  if (detail.isPending) return <PageLoader />;
  if (detail.isError || !detail.data) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <Alert variant="danger">No se pudo cargar el vino.</Alert>
      </main>
    );
  }

  const { wine } = detail.data;

  function onSubmit(input: CreateWineInput) {
    updateWine.mutate(input, { onSuccess: () => navigate(`/wines/${wineId}`) });
  }

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-4">
      <Link
        to={`/wines/${wineId}`}
        className="mb-4 inline-flex items-center gap-1 text-muted text-sm hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver
      </Link>
      <h1 className="mb-4 font-semibold text-fg text-xl">Editar vino</h1>
      <WineForm
        initial={{
          name: wine.name,
          type: wine.type,
          vintage: wine.vintage ? String(wine.vintage) : '',
          wineryName: wine.winery?.name ?? '',
          country: wine.country ?? '',
          region: wine.region ?? '',
          grapeNames: wine.grapes,
        }}
        submitLabel="Guardar cambios"
        loading={updateWine.isPending}
        submitError={updateWine.error}
        onSubmit={onSubmit}
      />
    </main>
  );
}
