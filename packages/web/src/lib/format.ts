/** Formato de puntaje: una decimal, coma decimal (es-AR). `4.33` → `4,3`. */
export function formatScore(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const relativeFormatter = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha relativa corta: "hoy", "hace 2 días". Cae a fecha absoluta si es vieja. */
export function formatRelativeDate(epochMs: number): string {
  const days = Math.round((epochMs - Date.now()) / DAY_MS);
  if (Math.abs(days) < 30) return relativeFormatter.format(days, 'day');
  return new Date(epochMs).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
