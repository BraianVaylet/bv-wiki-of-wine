/**
 * Acento (color base) configurable — mismo sistema que bv-personal-finances y
 * bv-my-investments. Deriva `--primary-strong/soft/on-primary` desde un hex base
 * calculando luminancia (WCAG) para asegurar contraste del texto en ambos temas.
 *
 * Comparte la clave `bv-accent` con las apps hermanas a propósito: son la misma
 * familia, y elegir violeta en una debe verse en las otras.
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

export const DEFAULT_ACCENT = ACCENTS[0]?.hex ?? '#C96442';
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
}

/** Deriva las variables del acento para un tema dado. */
export function deriveAccent(hex: string, mode: ThemeMode): DerivedAccent {
  const rgb = hexToRgb(hex);
  const base = mode === 'dark' ? lighten(rgb, 0.12) : rgb;
  const strong = mode === 'dark' ? lighten(rgb, 0.24) : darken(rgb, 0.14);
  const onPrimary = luminance(base) > ON_PRIMARY_LUMINANCE_THRESHOLD ? '#10100f' : '#ffffff';
  const soft = `rgba(${clamp(base.r)}, ${clamp(base.g)}, ${clamp(base.b)}, 0.16)`;
  return { primary: toHex(base), strong: toHex(strong), soft, onPrimary };
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

/** Aplica el acento al <html> como variables CSS. */
export function applyAccent(hex: string, mode: ThemeMode): void {
  const derived = deriveAccent(hex, mode);
  const el = document.documentElement;
  el.style.setProperty('--primary', derived.primary);
  el.style.setProperty('--primary-strong', derived.strong);
  el.style.setProperty('--primary-soft', derived.soft);
  el.style.setProperty('--on-primary', derived.onPrimary);
  applyFavicon(derived.primary);
}

/** Color de la barra del navegador (PWA) por tema. Coincide con --bg. */
const THEME_COLOR: Record<ThemeMode, string> = { light: '#faf9f5', dark: '#1f1e1d' };

/** Aplica el tema (data-theme) y reaplica el acento (cambia con el modo). */
export function applyTheme(mode: ThemeMode, accentHex: string): void {
  document.documentElement.setAttribute('data-theme', mode);
  applyAccent(accentHex, mode);
  // La barra del navegador en mobile sigue el tema, no un color fijo.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
}

/** Tema inicial: localStorage → preferencia del sistema. */
export function getInitialTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Acento inicial: localStorage → default. */
export function getInitialAccent(): string {
  return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT;
}
