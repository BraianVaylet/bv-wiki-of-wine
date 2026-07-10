# 05 · Sistema de diseño y UI

**El sistema de diseño no se inventa: se copia** de `bv-personal-finances` /
`bv-my-investments`. Mismos tokens, mismos nombres, mismos componentes base.
Un dev que salta entre los tres proyectos no aprende nada nuevo.

Lo único propio de esta app: el logo, el `StarRating`, el `BottleGlyph` y la
paleta de tipos de vino.

---

## 1. Qué se copia tal cual

Desde `bv-personal-finances/packages/web`:

| Archivo | Cambios |
|---------|---------|
| `src/theme/accent.ts` | Ninguno. Misma paleta de 6 acentos, mismo `deriveAccent`. |
| `src/theme/ThemeProvider.tsx` | Ninguno. |
| `src/styles.css` | Se agregan los tokens de tipo de vino (§4). |
| `src/components/ui/*` | Ninguno: `Button`, `Input`, `Textarea`, `Select`, `Card`, `Label`, `FieldError`, `Modal`, `ConfirmDialog`, `SegmentedControl`, `Spinner`, `EmptyState`, `Skeleton`, `Alert`. |
| `src/components/AccentMenu.tsx`, `ThemeToggle.tsx`, `AuthShell.tsx` | Cambia el `alt`/nombre. |
| `src/auth/*`, `src/lib/apiClient.ts`, `src/lib/cn.ts` | Ajustar rutas de la API. |
| Script anti-FOUC (`public/theme-init.js`) | Ninguno. |

Desde `bv-my-investments/apps/web`: `applyFavicon` / `faviconDataUri` — el favicon
se genera como data-URI con el acento activo, así el ícono de la pestaña sigue el
color elegido. Adaptar el SVG al de esta app.

---

## 2. Tokens

Idénticos a los hermanos. **Cero hex sueltos en componentes.**

```css
:root {                          [data-theme="dark"] {
  --bg: #faf9f5;                   --bg: #1f1e1d;
  --surface: #ffffff;              --surface: #292827;
  --surface-2: #f0eee6;            --surface-2: #35332f;
  --border: #e4e1d7;               --border: #3d3a35;
  --fg: #1a1915;                   --fg: #f4f2ec;
  --muted: #6b6862;                --muted: #aca899;
  --dim: #9c998f;                  --dim: #6e6b62;
  --danger: #c0584e;               --danger: #e0796d;
  --ok: #4f8a5b;                   --ok: #7fb389;
}                                }
```

**Acento por defecto: coral `#C96442`** (el mismo de las otras dos apps). Se
persiste en `localStorage` bajo la **misma clave `bv-accent`**, así que si el
usuario eligió violeta en BV Finanzas, esta app arranca en violeta también en el
mismo navegador. Es un efecto deseado: son la misma familia.

Los `--primary*` los sobreescribe `applyAccent()` en runtime derivando
`--primary-strong / --primary-soft / --on-primary` con luminancia WCAG. No los
hardcodees.

> Feliz coincidencia: el coral `#C96442` **es** un color de vino. El acento por
> defecto y el dominio coinciden sin forzar nada.

---

## 3. Marca

Assets en `assets/`. En la app se usan **inline** con `var(--primary)` para que el
logo siga el acento elegido (patrón de `bv-my-investments/src/components/Logo.tsx`).

| Archivo | Uso |
|---------|-----|
| `bv-wow-svg.svg` | Lockup horizontal — README, landing. Texto oscuro: **solo sobre fondo claro**. |
| `bv-wow-mini-svg.svg` | Isotipo cuadrado (copa + estrella) — header, login, app icon 192/512. |
| `bv-wow-favicon-svg.svg` | Solo la copa, centrada y más gruesa — favicon 16/32px. La estrella desaparece a ese tamaño. |

**Concepto:** una copa de vino dibujada con el trazo del acento y **rellena** con
el mismo color al 28% — el vino dentro del cristal. Al lado, una estrella verde
(`--ok`), que es lo que la app hace: puntuar. La estrella verde es el eco directo
del punto verde en el logo de BV Invest: misma familia, misma gramática.

Componente:

```tsx
/**
 * Isotipo inline: el trazo usa `--primary`, así el logo del header sigue el
 * acento elegido, igual que el favicon (ver theme/accent.ts → applyFavicon).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Wiki of Wine">
      <rect width="512" height="512" rx="112" fill="#1f1e1d" />
      <path
        d="M150 132 L310 132 L310 186 C310 250 276 296 230 306 C184 296 150 250 150 186 Z"
        fill="var(--primary)" fillOpacity="0.28"
        stroke="var(--primary)" strokeWidth="34" strokeLinejoin="round"
      />
      <path d="M230 306 L230 396" fill="none" stroke="var(--primary)" strokeWidth="34" strokeLinecap="round" />
      <path d="M166 404 L294 404" fill="none" stroke="var(--primary)" strokeWidth="34" strokeLinecap="round" />
      <path
        d="M404 78 L413.9 106.4 L443.9 107 L420 125.2 L428.7 154 L404 136.8 L379.3 154 L388 125.2 L364.1 107 L394.1 106.4 Z"
        fill="var(--ok)"
      />
    </svg>
  );
}
```

El `rect` de fondo va hardcodeado en `#1f1e1d` (como en BV Invest): la placa es
oscura **siempre**, en ambos temas. Es lo que hace que el ícono se lea igual en la
pantalla de inicio del celular, que no tiene tema.

Nombre corto (PWA `short_name`): **"Wiki of Wine"**. `theme_color` = `--bg` del tema.

---

## 4. Color por tipo de vino

Único set de colores nuevo. Se usa en el `BottleGlyph` (placeholder cuando no hay
foto) y en el chip de tipo.

```css
:root, [data-theme="dark"] {
  --wine-tinto:     #7B2D3B;
  --wine-blanco:    #D9C87A;
  --wine-rosado:    #E4A0A6;
  --wine-espumante: #E8D9A0;
  --wine-naranjo:   #D98E3F;
  --wine-dulce:     #A85C2E;
}
```

**El color nunca es el único portador de información** (WCAG 1.4.1): el chip de
tipo siempre lleva el texto ("Tinto"), y el `BottleGlyph` tiene `aria-label`.

---

## 5. Componentes propios

| Componente | Rol |
|------------|-----|
| **`StarRating`** | Ver §6. Modo `interactive` y `readonly`. |
| **`ScoreBadge`** | `★ 4,3 (3)` — promedio + cantidad. `Sin reseñas` cuando es `null`. Número tabular. |
| **`AxisBar`** | Un eje del detalle: label + `StarRating readonly` + `n personas`. `—` si el promedio es `null`. |
| **`BottleGlyph`** | SVG de botella coloreada por tipo. Placeholder cuando no hay foto y también ilustración del `EmptyState`. |
| **`WineCard`** | Foto/glyph + nombre + bodega + chips de uva + `ScoreBadge` + marca "ya lo reseñaste". |
| **`GrapeChips`** | Chips de uvas. Muestra 2 y `+3` si hay más. |
| **`WineTypeSelect`** | `SegmentedControl` scrolleable con los 6 tipos, cada uno con su punto de color. |
| **`PhotoInput`** | `<input type="file" accept="image/*" capture="environment">`. Preview con `URL.createObjectURL` + revoke. Muestra progreso de subida y error inline. |
| **`WineForm`** | Alta/edición. Autocomplete de bodega y de uvas (`<datalist>` nativo, no una lib). |
| **`ReviewForm`** | ★ global grande arriba; los 4 ejes colapsados bajo *"Agregar detalle"*; textarea con contador. |

### El `StarRating` es la app

Es la interacción central. Merece el 80% del cuidado.

---

## 6. Especificación del `StarRating`

### 6.1 · Accesibilidad primero (esto es lo que casi todos hacen mal)

**No** son cinco `<span>` con `onClick`. Es un **radiogroup nativo**:

```tsx
<fieldset className="border-0 p-0">
  <legend className="sr-only">Puntaje general</legend>
  {[1, 2, 3, 4, 5].map((n) => (
    <label key={n}>
      <input
        type="radio" name="overall" value={n}
        checked={value === n} onChange={() => onChange(n)}
        className="peer sr-only"
      />
      <StarIcon
        filled={n <= (hover ?? value ?? 0)}
        className="peer-focus-visible:ring-2 peer-focus-visible:ring-primary …"
      />
      <span className="sr-only">{n} de 5 estrellas</span>
    </label>
  ))}
</fieldset>
```

Gratis con esto: navegación con flechas ←/→, `Tab` entra y sale del grupo,
lectores de pantalla anuncian "3 de 5 estrellas", funciona sin JS de teclado propio.

Para los ejes opcionales se agrega un sexto radio `—` ("Sin puntuar", `value=""`)
al **inicio** del grupo. Así "no puntuado" es un estado alcanzable con teclado y
distinto de "cero" (que no existe — RN-3).

- Área táctil: cada estrella ≥ 44×44px aunque el ícono dibuje 28px (padding).
- `readonly`: se renderiza como `<div role="img" aria-label="4,3 de 5 estrellas">`,
  sin inputs, sin foco. Media estrella se dibuja con un `<linearGradient>` que
  corta en el porcentaje exacto — solo en modo readonly (los promedios son decimales).

### 6.2 · Movimiento

- Al seleccionar: la estrella escala `1 → 1.25 → 1` en 180 ms, `ease-out`, y las
  anteriores se rellenan con 30 ms de stagger. Suficiente para que se sienta
  táctil, corto para no estorbar.
- `hover`/`focus`: preview del relleno hasta la estrella apuntada.
- **`@media (prefers-reduced-motion: reduce)` → sin escala, sin stagger.** El
  relleno cambia igual (es información, no decoración).

### 6.3 · Contraste

Estrella llena: `--primary`. Vacía: `--dim` con borde `--muted`. En ambos temas se
verifica ≥ 3:1 contra `--surface` (criterio de componentes no textuales, WCAG 1.4.11).
El valor numérico siempre acompaña (`★★★★☆ 4`), nunca solo estrellas.

---

## 7. Layout (mobile-first, ~390px)

`AppShell` = header compacto + **tab bar inferior** (patrón de BV Finanzas).

```
┌─────────────────────────────────────┐
│ 🍷 Wiki of Wine        🎨  ☾        │  header: logo, acento, tema
├─────────────────────────────────────┤
│ [🔍 Buscar vino o bodega        ]   │
│ ( Todos )(Tinto)(Blanco)(Rosado)→   │  SegmentedControl scrolleable
├─────────────────────────────────────┤
│ ┌───┬───────────────────────────┐   │
│ │IMG│ Nicasia Red Blend      ✓  │   │  ✓ = ya lo reseñaste
│ │   │ Catena Zapata · 2019      │   │
│ │   │ (Malbec)(Cab. Franc)      │   │
│ │   │ ★★★★☆ 4,3  (3)            │   │
│ └───┴───────────────────────────┘   │
│ ┌───┬───────────────────────────┐   │
│ │IMG│ Alamos Chardonnay         │   │
│ │   │ ★★★☆☆ 3,0  (1)            │   │
│ └───┴───────────────────────────┘   │
│                                 (＋)│  FAB — alcance con el pulgar
├─────────────────────────────────────┤
│  Vinos  │  Mis reseñas  │  Ajustes  │
└─────────────────────────────────────┘
```

**Detalle del vino:**

```
‹ Volver                          ⋮   ⋮ = editar/borrar (solo dueño/admin)
┌─────────────────────────────────────┐
│           [ foto 4:3 ]              │
└─────────────────────────────────────┘
Nicasia Red Blend
Catena Zapata · Tinto · 2019 · Mendoza
(Malbec) (Cabernet Franc)

★★★★☆ 4,3   3 reseñas
─────────────────────────────────────
Gusto           ★★★★☆ 4,5   (2)
Aroma           —  sin datos
Cuerpo          ★★★☆☆ 3,0   (3)
Precio/calidad  ★★★★☆ 4,0   (1)
─────────────────────────────────────
TU RESEÑA                    [Editar]
★★★★★  "El de nuestro aniversario."
─────────────────────────────────────
sofi · hace 2 días
★★★★☆  "Rico pero algo caro."
```

Las reseñas ajenas son de **solo lectura**, sin botones. El affordance de edición
existe únicamente en la propia.

---

## 8. Estados vacíos y de error

| Pantalla | Vacío |
|----------|-------|
| Home sin vinos | `BottleGlyph` grande, gris. *"Todavía no hay vinos."* + `[Cargar el primero]` |
| Home con filtro sin resultados | *"Ningún vino coincide con «malbec 2019»."* + `[Limpiar filtros]` |
| Detalle sin reseñas | Copa vacía. *"Nadie lo reseñó todavía. Sé el primero."* + `[Puntuar]` |
| Mis reseñas vacío | *"Todavía no puntuaste ningún vino."* + `[Ver el catálogo]` |
| Error de red | `Alert` variante `danger` + `[Reintentar]`. Nunca pantalla en blanco. |

**Carga:** `Skeleton` con la forma de la `WineCard` (imagen + 3 líneas), 4 de ellas.
No un spinner centrado: el skeleton evita el salto de layout (CLS).

---

## 9. Formularios

- Validación **inline al blur**, no al submit. El mensaje va debajo del campo,
  en `--danger`, con `aria-describedby` + `aria-invalid`.
- Mensajes que resuelven: *"La cosecha tiene que estar entre 1900 y 2027."*
  No *"Valor inválido"*.
- `inputmode="numeric"` en cosecha. `autocomplete="off"` en los autocompletes de
  bodega/uva (el del navegador estorba).
- Botón de submit con estado `loading`; se deshabilita, no desaparece.
- Al fallar el submit, foco al primer campo con error.

---

## 10. Performance

- Code splitting por ruta con `React.lazy` + `<Suspense>` (fallback = `PageLoader`).
- Fotos: `loading="lazy"`, `decoding="async"`, `width`/`height` explícitos.
  Se sirven ya en WebP ≤ 1200px, `immutable`.
- `lucide-react` con imports nombrados (tree-shaking); no `import * as Icons`.
- El `BottleGlyph` es SVG inline: cero requests para el placeholder.
- PWA con `vite-plugin-pwa`: precache del shell, `NetworkFirst` para `/api`,
  `CacheFirst` para `/api/wines/*/photo`.

---

## 11. Checklist antes de cerrar una pantalla

- [ ] Dark y light correctos, **solo tokens**, ningún hex suelto.
- [ ] Los 4 estados: cargando (skeleton), vacío, error, con datos.
- [ ] Targets ≥ 44px; FAB y acciones primarias al alcance del pulgar.
- [ ] Navegable entera con teclado; `:focus-visible` visible en todo control.
- [ ] Contraste AA verificado (texto 4.5:1, UI 3:1).
- [ ] Ninguna información transmitida solo por color.
- [ ] `prefers-reduced-motion` respetado.
- [ ] Optimistic update donde la latencia se nota (puntuar).
- [ ] Revisado con las skills **web-design-guidelines** y **frontend-design**.
