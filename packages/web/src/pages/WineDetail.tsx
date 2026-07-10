import { REVIEW_AXIS_LABELS, WINE_TYPE_LABELS } from '@bv/shared';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../auth/useAuth';
import { AxisBar } from '../components/AxisBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { GrapeChips } from '../components/GrapeChips';
import { PhotoInput } from '../components/PhotoInput';
import { ReviewForm } from '../components/ReviewForm';
import { ReviewItem } from '../components/ReviewList';
import { ScoreBadge } from '../components/ScoreBadge';
import { StarRatingDisplay } from '../components/StarRating';
import { Alert, Button, PageLoader } from '../components/ui';
import { useDeleteReview, useUpsertReview } from '../hooks/useReviews';
import { useDeleteWine, useWine } from '../hooks/useWines';

export function WineDetail() {
  const { id } = useParams();
  const wineId = Number(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: user } = useSession();

  const detail = useWine(wineId);
  const upsert = useUpsertReview(wineId);
  const deleteReview = useDeleteReview(wineId);
  const deleteWine = useDeleteWine();

  const [editing, setEditing] = useState(searchParams.get('review') === '1');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (detail.isPending) return <PageLoader />;
  if (detail.isError || !detail.data) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <Alert variant="danger">
          No se pudo cargar el vino.{' '}
          <button type="button" onClick={() => detail.refetch()} className="underline">
            Reintentar
          </button>
        </Alert>
      </main>
    );
  }

  const { wine, aggregates, reviews } = detail.data;
  const myReview = reviews.find((r) => r.isMine) ?? null;
  const otherReviews = reviews.filter((r) => !r.isMine);
  const canEditWine = user && (wine.createdBy === user.id || user.isAdmin);

  const meta = [wine.winery?.name, WINE_TYPE_LABELS[wine.type], wine.vintage, wine.region]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-4 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-muted text-sm hover:text-fg">
          <ArrowLeft size={16} aria-hidden="true" />
          Volver
        </Link>
        {canEditWine && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" to={`/wines/${wineId}/edit`}>
              <Pencil size={14} aria-hidden="true" /> Editar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} aria-hidden="true" />
              <span className="sr-only">Borrar vino</span>
            </Button>
          </div>
        )}
      </div>

      <div className="mb-3">
        <PhotoInput
          wineId={wineId}
          type={wine.type}
          photoUrl={wine.photoUrl}
          canEdit={Boolean(canEditWine)}
        />
      </div>

      <h1 className="font-semibold text-fg text-2xl">{wine.name}</h1>
      {meta && <p className="mt-0.5 text-muted">{meta}</p>}
      <div className="mt-2">
        <GrapeChips grapes={wine.grapes} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <ScoreBadge avg={aggregates.avgOverall} count={aggregates.reviewCount} />
      </div>

      {aggregates.reviewCount > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <AxisBar label={REVIEW_AXIS_LABELS.taste} avg={aggregates.avgTaste} />
          <AxisBar label={REVIEW_AXIS_LABELS.aroma} avg={aggregates.avgAroma} />
          <AxisBar label={REVIEW_AXIS_LABELS.body} avg={aggregates.avgBody} />
          <AxisBar label={REVIEW_AXIS_LABELS.valueForMoney} avg={aggregates.avgValueForMoney} />
        </div>
      )}

      {/* Tu reseña */}
      <section className="mt-6">
        <h2 className="mb-2 font-semibold text-fg">Tu reseña</h2>
        {editing ? (
          <ReviewForm
            initial={myReview}
            loading={upsert.isPending}
            error={upsert.error}
            onSubmit={(input) => upsert.mutate(input, { onSuccess: () => setEditing(false) })}
            onCancel={() => setEditing(false)}
          />
        ) : myReview ? (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <StarRatingDisplay value={myReview.overall} size={18} />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={deleteReview.isPending}
                  onClick={() => deleteReview.mutate()}
                >
                  Borrar
                </Button>
              </div>
            </div>
            {myReview.notes && <p className="mt-2 text-fg text-sm">{myReview.notes}</p>}
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={() => setEditing(true)}>
            Puntuar este vino
          </Button>
        )}
      </section>

      {/* Reseñas de otros */}
      {otherReviews.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 font-semibold text-fg">
            {otherReviews.length === 1 ? 'Otra reseña' : `Otras ${otherReviews.length} reseñas`}
          </h2>
          <div className="rounded-xl border border-border bg-surface px-4">
            {otherReviews.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </div>
        </section>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Borrar este vino"
          message={
            aggregates.reviewCount > 0
              ? `Se van a ocultar ${aggregates.reviewCount} reseña(s), incluidas las de otras personas.`
              : 'El vino desaparece del catálogo.'
          }
          confirmLabel="Borrar"
          loading={deleteWine.isPending}
          onConfirm={() => deleteWine.mutate(wineId, { onSuccess: () => navigate('/') })}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </main>
  );
}
