/**
 * Isotipo inline: la copa usa `--primary`, así el logo del header sigue el acento
 * elegido, igual que el favicon (ver theme/accent.ts → applyFavicon).
 *
 * La placa de fondo va hardcodeada en `#1f1e1d` en ambos temas: es el ícono que
 * se ve en la pantalla de inicio del celular, que no tiene tema.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Wiki of Wine">
      <title>Wiki of Wine</title>
      <rect width="512" height="512" rx="112" fill="#1f1e1d" />
      <path
        d="M150 132 L310 132 L310 186 C310 250 276 296 230 306 C184 296 150 250 150 186 Z"
        fill="var(--primary)"
        fillOpacity="0.28"
        stroke="var(--primary)"
        strokeWidth="34"
        strokeLinejoin="round"
      />
      <path
        d="M230 306 L230 396"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <path
        d="M166 404 L294 404"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <path
        d="M404 78 L413.9 106.4 L443.9 107 L420 125.2 L428.7 154 L404 136.8 L379.3 154 L388 125.2 L364.1 107 L394.1 106.4 Z"
        fill="var(--ok)"
      />
    </svg>
  );
}
