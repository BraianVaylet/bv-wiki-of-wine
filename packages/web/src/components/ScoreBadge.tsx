import { formatScore } from '../lib/format';
import { StarRatingDisplay } from './StarRating';

interface ScoreBadgeProps {
  avg: number | null;
  count: number;
}

/** `★★★★☆ 4,3 (3)`. "Sin reseñas" cuando no hay ninguna. */
export function ScoreBadge({ avg, count }: ScoreBadgeProps) {
  if (avg === null || count === 0) {
    return <span className="text-dim text-sm">Sin reseñas</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <StarRatingDisplay value={avg} />
      <span className="tabular font-medium text-fg">{formatScore(avg)}</span>
      <span className="text-muted">({count})</span>
    </span>
  );
}
