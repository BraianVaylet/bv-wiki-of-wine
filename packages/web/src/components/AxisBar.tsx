import { formatScore } from '../lib/format';
import { StarRatingDisplay } from './StarRating';

interface AxisBarProps {
  label: string;
  avg: number | null;
}

/** Un eje del detalle: label + estrellas del promedio, o "— sin datos". */
export function AxisBar({ label, avg }: AxisBarProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-fg text-sm">{label}</span>
      {avg === null ? (
        <span className="text-dim text-sm">— sin datos</span>
      ) : (
        <span className="inline-flex items-center gap-2">
          <StarRatingDisplay value={avg} />
          <span className="tabular text-muted text-sm">{formatScore(avg)}</span>
        </span>
      )}
    </div>
  );
}
