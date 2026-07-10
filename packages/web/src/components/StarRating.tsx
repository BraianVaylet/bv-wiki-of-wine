import { RATING } from '@bv/shared';
import { useId, useState } from 'react';
import { cn } from '../lib/cn';

const STARS = Array.from({ length: RATING.max }, (_, i) => i + 1);
const CLEAR_VALUE = 0;

interface StarIconProps {
  /** 0..1: cuánto se rellena (1 = lleno). Los decimales solo en readonly. */
  fill: number;
  size: number;
  gradientId: string;
}

function StarIcon({ fill, size, gradientId }: StarIconProps) {
  const clipId = `${gradientId}-clip`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={clipId}>
          <stop offset={`${fill * 100}%`} stopColor="var(--primary)" />
          <stop offset={`${fill * 100}%`} stopColor="var(--dim)" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.3l6.5-.9z"
        fill={`url(#${clipId})`}
        stroke="var(--border)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

interface InteractiveProps {
  name: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** Si es opcional, se agrega la opción "—" (sin puntuar) al inicio. */
  clearable?: boolean;
  size?: number;
  legend: string;
}

const DEFAULT_SIZE = 32;

/**
 * Selector de estrellas accesible: un radiogroup nativo, no cinco spans con
 * onClick. Regala navegación con flechas, foco, y anuncio "N de 5 estrellas"
 * para lectores de pantalla.
 *
 * `clearable` agrega un radio "—" para "sin puntuar" (value null), distinto de
 * "cero" (que no existe — RN-3).
 */
export function StarRating({
  name,
  value,
  onChange,
  clearable = false,
  size = DEFAULT_SIZE,
  legend,
}: InteractiveProps) {
  const groupId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? CLEAR_VALUE;

  return (
    <fieldset className="border-0 p-0" onMouseLeave={() => setHover(null)}>
      <legend className="sr-only">{legend}</legend>
      <div className="flex items-center gap-1">
        {clearable && (
          <label
            className={cn(
              'flex h-11 w-8 cursor-pointer items-center justify-center rounded-md text-sm',
              value === null ? 'bg-primary-soft text-fg' : 'text-dim hover:text-muted',
            )}
          >
            <input
              type="radio"
              name={name}
              checked={value === null}
              onChange={() => onChange(null)}
              className="sr-only"
            />
            <span aria-hidden="true">—</span>
            <span className="sr-only">Sin puntuar</span>
          </label>
        )}
        {STARS.map((star) => (
          <label
            key={star}
            className="flex h-11 w-11 cursor-pointer items-center justify-center"
            onMouseEnter={() => setHover(star)}
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="peer sr-only"
            />
            <span className="scale-100 transition-transform peer-checked:scale-110 peer-focus-visible:rounded peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
              <StarIcon
                fill={star <= shown ? 1 : 0}
                size={size}
                gradientId={`${groupId}-${star}`}
              />
            </span>
            <span className="sr-only">{`${star} de ${RATING.max} estrellas`}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const READONLY_SIZE = 16;

/**
 * Estrellas de solo lectura, con medias estrellas (los promedios son decimales).
 * Sin inputs ni foco: es una imagen con su etiqueta textual.
 */
export function StarRatingDisplay({
  value,
  size = READONLY_SIZE,
}: {
  value: number;
  size?: number;
}) {
  const baseId = useId();
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${value.toFixed(1)} de ${RATING.max} estrellas`}
    >
      {STARS.map((star) => {
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        return <StarIcon key={star} fill={fill} size={size} gradientId={`${baseId}-${star}`} />;
      })}
    </span>
  );
}
