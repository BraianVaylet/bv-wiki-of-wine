import type { WineType } from '@bv/shared';
import { WINE_TYPE_LABELS } from '@bv/shared';
import { useId } from 'react';

/** Color del líquido por tipo. Coincide con los tokens --wine-* de styles.css. */
const TYPE_COLOR: Record<WineType, string> = {
  tinto: 'var(--wine-tinto)',
  blanco: 'var(--wine-blanco)',
  rosado: 'var(--wine-rosado)',
  espumante: 'var(--wine-espumante)',
  naranjo: 'var(--wine-naranjo)',
  dulce: 'var(--wine-dulce)',
};

/** Silueta de la botella (cuello + hombro + cuerpo). Simétrica en x=32. */
const BOTTLE_PATH =
  'M28 11 L28 19 C28 23 22 25 22 34 L22 54 Q22 58 26 58 L38 58 Q42 58 42 54 L42 34 C42 25 36 23 36 19 L36 11 Z';

/**
 * Botella SVG con el vino recortado dentro de su silueta (clipPath), así el
 * líquido nunca se sale del contorno. Placeholder cuando no hay foto y también
 * ilustración de los estados vacíos. El color no va solo: el `aria-label` dice
 * el tipo (WCAG 1.4.1).
 */
export function BottleGlyph({ type, className }: { type: WineType; className?: string }) {
  const clipId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={`Botella de vino ${WINE_TYPE_LABELS[type].toLowerCase()}`}
    >
      <title>{WINE_TYPE_LABELS[type]}</title>
      <defs>
        <clipPath id={clipId}>
          <path d={BOTTLE_PATH} />
        </clipPath>
      </defs>

      {/* Tapa */}
      <rect
        x="27"
        y="5"
        width="10"
        height="7"
        rx="1.5"
        fill="var(--surface-2)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />

      {/* Vidrio (relleno de toda la botella) */}
      <path d={BOTTLE_PATH} fill="var(--surface-2)" />

      {/* Vino: rectángulo recortado a la silueta → toma la forma del cuerpo */}
      <rect
        x="20"
        y="38"
        width="24"
        height="22"
        fill={TYPE_COLOR[type]}
        opacity="0.9"
        clipPath={`url(#${clipId})`}
      />

      {/* Contorno por encima */}
      <path
        d={BOTTLE_PATH}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
