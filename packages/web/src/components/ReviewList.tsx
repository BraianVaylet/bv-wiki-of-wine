import type { Review } from '@bv/shared';
import { REVIEW_AXES, REVIEW_AXIS_LABELS } from '@bv/shared';
import { formatRelativeDate } from '../lib/format';
import { StarRatingDisplay } from './StarRating';

/** Ejes puntuados de una reseña, como chips compactos. */
function AxisSummary({ review }: { review: Review }) {
  const scored = REVIEW_AXES.filter((axis) => review[axis] !== null);
  if (scored.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted text-xs">
      {scored.map((axis) => (
        <span key={axis} className="inline-flex items-center gap-1">
          {REVIEW_AXIS_LABELS[axis]}
          <span className="tabular font-medium text-fg">{review[axis]}</span>
        </span>
      ))}
    </div>
  );
}

/** Una reseña ajena (solo lectura). La propia se maneja aparte, editable. */
export function ReviewItem({ review }: { review: Review }) {
  return (
    <div className="border-border border-t py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-fg text-sm">{review.author.alias}</span>
        <span className="text-dim text-xs">{formatRelativeDate(review.updatedAt)}</span>
      </div>
      <div className="mt-1">
        <StarRatingDisplay value={review.overall} size={16} />
      </div>
      <AxisSummary review={review} />
      {review.notes && <p className="mt-1 text-fg text-sm">{review.notes}</p>}
    </div>
  );
}
