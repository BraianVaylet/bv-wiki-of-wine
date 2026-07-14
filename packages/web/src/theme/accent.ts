/**
 * Acento (color base) configurable — mismo sistema que bv-personal-finances y
 * bv-my-investments. Deriva variantes desde un hex base calculando luminancia
 * (WCAG) para asegurar contraste del texto en ambos temas, y las escribe sobre
 * los tokens de medano-ui (`--medano-accent-*`); las vars legacy (`--primary*`)
 * son alias de esos tokens en styles.css, así que se actualizan solas.
 *
 * Sin acento guardado no se escribe nada: vale el acento nativo de medano
 * («brasa»). Comparte la clave `bv-accent` con las apps hermanas a propósito:
 * son la misma familia, y elegir violeta en una debe verse en las otras.
 *
 * La lógica está duplicada (en versión mínima) en el script anti-FOUC de
 * index.html; mantener ambas en sync si cambia la fórmula.
 */

export type ThemeMode = 'light' | 'dark';

export interface AccentOption {
  key: string;
  label: string;
  hex: string;
}

/** Paleta de acentos (misma que las apps hermanas). Por defecto el coral. */
export const ACCENTS: readonly AccentOption[] = [
  { key: 'coral', label: 'Coral', hex: '#C96442' },
  { key: 'orange', label: 'Naranja', hex: '#F76808' },
  { key: 'green', label: 'Verde', hex: '#30A46C' },
  { key: 'blue', label: 'Azul', hex: '#0091FF' },
  { key: 'violet', label: 'Violeta', hex: '#8E4EC6' },
  { key: 'teal', label: 'Teal', hex: '#12A594' },
];

/** Aproximación sRGB de --medano-accent-base («brasa», oklch(0.66 0.13 39)).
    Solo para el favicon cuando no hay acento elegido; la UI usa el token real. */
export const BRASA_ACCENT_HEX = '#C86A4B';
export const THEME_KEY = 'bv-theme';
export const ACCENT_KEY = 'bv-accent';

/** Umbral de luminancia sobre el que el texto encima del acento pasa a oscuro. */
const ON_PRIMARY_LUMINANCE_THRESHOLD = 0.45;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla hacia blanco (amt 0..1). */
function lighten(rgb: Rgb, amt: number): Rgb {
  return {
    r: rgb.r + (255 - rgb.r) * amt,
    g: rgb.g + (255 - rgb.g) * amt,
    b: rgb.b + (255 - rgb.b) * amt,
  };
}

/** Mezcla hacia negro (amt 0..1). */
function darken(rgb: Rgb, amt: number): Rgb {
  return { r: rgb.r * (1 - amt), g: rgb.g * (1 - amt), b: rgb.b * (1 - amt) };
}

/** Luminancia relativa WCAG (0..1). */
export function luminance(rgb: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export interface DerivedAccent {
  primary: string;
  strong: string;
  soft: string;
  onPrimary: string;
  focusRing: string;
}

/** Deriva las variables del acento para un tema dado. */
export function deriveAccent(hex: string, mode: ThemeMode): DerivedAccent {
  const rgb = hexToRgb(hex);
  const base = mode === 'dark' ? lighten(rgb, 0.12) : rgb;
  const strong = mode === 'dark' ? lighten(rgb, 0.24) : darken(rgb, 0.14);
  const onPrimary = luminance(base) > ON_PRIMARY_LUMINANCE_THRESHOLD ? '#10100f' : '#ffffff';
  const rgbArgs = `${clamp(base.r)}, ${clamp(base.g)}, ${clamp(base.b)}`;
  return {
    primary: toHex(base),
    strong: toHex(strong),
    soft: `rgba(${rgbArgs}, 0.16)`,
    onPrimary,
    focusRing: `rgba(${rgbArgs}, 0.75)`,
  };
}

/** Favicon SVG (data-URI) con la copa en el color de acento — igual que el logo. */
export function faviconDataUri(primaryHex: string): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '<rect width="512" height="512" rx="112" fill="#1f1e1d"/>',
    '<g transform="translate(26 0)">',
    `<path d="M150 122 L310 122 L310 180 C310 248 276 298 230 309 C184 298 150 248 150 180 Z" fill="${primaryHex}" fill-opacity="0.28" stroke="${primaryHex}" stroke-width="38" stroke-linejoin="round"/>`,
    `<path d="M230 309 L230 400" fill="none" stroke="${primaryHex}" stroke-width="38" stroke-linecap="round"/>`,
    `<path d="M164 410 L296 410" fill="none" stroke="${primaryHex}" stroke-width="38" stroke-linecap="round"/>`,
    '</g></svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function applyFavicon(primaryHex: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = faviconDataUri(primaryHex);
}

/** Tokens de medano-ui que sobrescribe el acento elegido. */
const MEDANO_ACCENT_VARS = [
  '--medano-accent-base',
  '--medano-accent-strong',
  '--medano-accent-subtle',
  '--medano-ink-on-accent',
  '--medano-border-focus',
] as const;

/** Aplica el acento al <html> sobre los tokens de medano-ui. */
export function applyAccent(hex: string, mode: ThemeMode): void {
  const derived = deriveAccent(hex, mode);
  const el = document.documentElement;
  el.style.setProperty('--medano-accent-base', derived.primary);
  el.style.setProperty('--medano-accent-strong', derived.strong);
  el.style.setProperty('--medano-accent-subtle', derived.soft);
  el.style.setProperty('--medano-ink-on-accent', derived.onPrimary);
  el.style.setProperty('--medano-border-focus', derived.focusRing);
  applyFavicon(derived.primary);
}

/** Quita las sobreescrituras: vuelve al acento nativo de medano (brasa). */
export function clearAccent(): void {
  const el = document.documentElement;
  for (const varName of MEDANO_ACCENT_VARS) el.style.removeProperty(varName);
  applyFavicon(BRASA_ACCENT_HEX);
}

/** Fallback para la barra del navegador si el token aún no está disponible
    (tests con jsdom). Aproxima --medano-surface-0 por tema. */
const THEME_COLOR_FALLBACK: Record<ThemeMode, string> = { light: '#faf9f3', dark: '#201e1a' };

/** Aplica el tema (data-theme) y reaplica el acento (cambia con el modo). */
export function applyTheme(mode: ThemeMode, accentHex: string | null): void {
  document.documentElement.setAttribute('data-theme', mode);
  if (accentHex) {
    applyAccent(accentHex, mode);
  } else {
    clearAccent();
  }
  // La barra del navegador en mobile sigue el fondo del tema. Se lee el token
  // computado para no duplicar el valor (los navegadores modernos aceptan
  // oklch() en theme-color).
  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue('--medano-surface-0')
    .trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', surface || THEME_COLOR_FALLBACK[mode]);
}

/** Tema inicial: localStorage → preferencia del sistema. */
export function getInitialTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Acento inicial: hex guardado, o null = acento nativo de medano (brasa). */
export function getInitialAccent(): string | null {
  return localStorage.getItem(ACCENT_KEY);
}
