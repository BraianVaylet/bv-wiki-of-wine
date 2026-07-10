# 04 · Arquitectura

Copia deliberada de `bv-bow-sight` (SQLite) + `bv-personal-finances` (UI, auth).
Todo lo que sea igual, es igual. La novedad se paga cara en mantenimiento.

---

## 1. Forma general

Un **único servicio**: un proceso Node donde Hono sirve `/api/*` y, en producción,
también los archivos estáticos del build de React. Un contenedor, un puerto, un
deploy.

```
                 ┌──────────────────────────────────────────┐
   navegador ──▶ │  Hono (packages/api)                     │
                 │   /api/*  → rutas → servicios → repos    │
                 │   /*      → SPA estática (WEB_DIST)      │
                 └──────────────┬──────────────┬────────────┘
                                │              │
                        better-sqlite3     fs (uploads)
                                │              │
                        /data/wow.db     /data/uploads/*.webp
                                └──── volumen Railway ───┘
```

Alternativa descartada: front en Vercel + API aparte. Suma CORS, un dominio más,
y cookies cross-site (`SameSite=None`) — más superficie, cero beneficio para dos
personas.

---

## 2. Monorepo

```
bv-wiki-of-wine/
├── packages/
│   ├── shared/          # @bv/shared — tipos + esquemas Zod. Cero deps de runtime salvo zod
│   ├── api/             # @bv/api    — Hono + better-sqlite3 + sharp
│   └── web/             # @bv/web    — React + Vite + Tailwind v4
├── assets/              # logos SVG
├── docs/
├── Dockerfile
├── railway.json
├── pnpm-workspace.yaml
└── biome.json
```

`pnpm` workspaces, Node ≥ 20, **Biome** (no ESLint+Prettier) — igual que
`bv-personal-finances` y `bv-bow-sight`.

### Por qué `@bv/shared`

Los esquemas Zod (`wineSchema`, `reviewSchema`, `loginSchema`) se definen **una
vez** y los importan los dos lados. El front valida en el `onSubmit` con el mismo
schema que la API usa en `parseBody`. Cuando cambia una regla, no hay dos verdades.

`shared` exporta el `.ts` directo (`exports: { ".": { "default": "./src/index.ts" } }`),
sin build en dev. Es lo que ya hacen los hermanos.

---

## 3. Capas de la API

```
routes/       Hono. Parsea, valida (Zod), llama al servicio, serializa. Sin lógica.
services/     Reglas de negocio y autorización. No sabe qué es un `Context` de Hono.
repositories/ SQL. Statements preparados. No sabe qué es una regla de negocio.
db/           connection.ts, schema.ts, seed.ts, reset.ts
lib/          csrf, hash, session, tokens, errors, time, images
middleware/   auth, csrf, error, rateLimit, security, validate
```

Regla dura: **un `services/` nunca importa de `hono`**. Eso lo hace testeable con
una DB en memoria y sin levantar un servidor. Y **un `routes/` nunca escribe SQL**.

### Autorización: en el servicio, no en la ruta

```ts
// services/wineService.ts
export function updateWine(actor: Actor, wineId: number, patch: WinePatch): Wine {
  const wine = wineRepo.findById(wineId);
  if (!wine || wine.deletedAt) throw notFound('Ese vino no existe.');
  if (wine.createdBy !== actor.id && !actor.isAdmin) {
    throw forbidden('Solo quien cargó el vino puede editarlo.');
  }
  return wineRepo.update(wineId, patch);
}
```

Si el check vive en el middleware o en la ruta, se olvida en la próxima ruta que
toque el recurso. En el servicio, es imposible llegar al repo sin pasar por él.

### Estado global

Ninguno, salvo dos singletons explícitos: la conexión SQLite y el store en memoria
del rate limiter. Ambos creados en `index.ts` e inyectados. Los repositorios reciben
`db` por parámetro → los tests usan `:memory:` sin mockear nada.

---

## 4. Capas del front

```
src/
├── auth/          useAuth, ProtectedRoute, PublicOnlyRoute
├── components/
│   ├── ui/        Button, Card, Input, Modal, Spinner, EmptyState, …  (copiados)
│   └── …          StarRating, WineCard, WineForm, ReviewForm, PhotoInput, BottleGlyph
├── features/
│   ├── wines/     WinesPage, WineDetailPage, NewWinePage
│   └── me/        MyReviewsPage
├── hooks/         useWines, useWine, useReviewMutation  (React Query)
├── lib/           apiClient, queryClient, cn, format
├── theme/         accent.ts, ThemeProvider.tsx          (copiados tal cual)
└── main.tsx
```

- **Servidor como fuente de verdad.** React Query maneja caché, revalidación y
  estados. Cero Redux, cero Context para datos.
- **Context solo para tema y sesión** — cosas que sí son globales de verdad.
- **Optimistic updates** en `useReviewMutation`: la estrella se pinta ya, y
  `onError` hace rollback + toast. Es la única interacción donde la latencia se nota.

### `apiClient`

Un `fetch` envuelto que: agrega `credentials: 'include'`, inyecta el header
`x-csrf-token` desde la cookie en mutaciones, y traduce el `{ error: { code } }`
de la API a un `ApiError` tipado. Un solo lugar donde vive el contrato de errores.

Un `401` en cualquier respuesta → `queryClient.clear()` + redirect a `/login`.

---

## 5. Decisiones y trade-offs

| Decisión | Alternativa | Por qué |
|----------|-------------|---------|
| **better-sqlite3 (síncrono)** | `node:sqlite`, Drizzle, Prisma | Ya está en `bv-cross`/`bv-bow-sight`. Síncrono es *más rápido* acá: no hay I/O de red, y el event loop no se bloquea de forma medible con queries de µs. Un ORM agregaría una capa para 6 tablas. |
| **Sin migraciones (`CREATE TABLE IF NOT EXISTS`)** | `drizzle-kit`, `node-pg-migrate` | Es lo que hace `bv-bow-sight`. **Limitación real:** cambiar una columna existente requiere un script manual. Aceptable pre-producción; en cuanto haya datos que te importen, agregá un `schema_version` y migraciones numeradas. Está anotado en el [09-action-plan](09-action-plan.md) como deuda consciente. |
| **`sharp` para re-codificar fotos** | Guardar el original tal cual | Guardar el archivo del cliente es servir un archivo del cliente. `sharp` normaliza a WebP y de paso borra EXIF (geolocalización) y neutraliza polyglots. Es una dep nativa: sube el tamaño de la imagen Docker ~30 MB. Vale. |
| **Cookie de sesión + CSRF double-submit** | JWT en `localStorage` | `localStorage` es legible por cualquier XSS. `httpOnly` no. El costo es el token CSRF, que ya está resuelto y copiado. |
| **Un contenedor** | API y web separadas | Menos piezas, sin CORS, sin cookies cross-site. |
| **SQLite** | Postgres | Pocos usuarios, escrituras raras. **Costo:** una sola instancia (single writer). No escalar réplicas. Ver [08-hosting](08-hosting.md) §2. |

---

## 6. Configuración

`packages/api/src/env.ts` valida con Zod al arrancar y **mata el proceso** si algo
falta en producción (patrón de `bv-bow-sight`). No hay `process.env.X` disperso.

```
NODE_ENV=development
PORT=3000
DATABASE_PATH=./data/dev.db
UPLOAD_DIR=./data/uploads
SESSION_SECRET=            # openssl rand -hex 32 — obligatorio en prod
SESSION_TTL_DAYS=30
COOKIE_SECURE=false        # true en prod
CORS_ORIGIN=http://localhost:5173
WEB_DIST=public            # relativo al cwd de @bv/api

REGISTER_ENABLED=true
MAX_USERS=50               # circuit breaker del registro abierto
ADMIN_ALIAS=               # el alias que recibe is_admin=1 al registrarse

MAX_UPLOAD_BYTES=6291456   # 6 MB
UPLOAD_RATE_LIMIT_MAX=20   # por usuario por día
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
AUTH_RATE_LIMIT_MAX=10
LOGIN_MAX_ATTEMPTS=8
LOGIN_LOCK_MINUTES=15
LOG_LEVEL=info
```

`.env` en `.gitignore`. `.env.example` commiteado, sin valores reales.

---

## 7. Dependencias (mínimas, mantenidas)

**API:** `hono`, `@hono/node-server`, `better-sqlite3`, `@node-rs/argon2`, `sharp`, `zod`.
**Web:** `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `lucide-react`.
**Shared:** `zod`.

No entra nada más sin justificarlo. Un `date-fns` para formatear tres fechas es
`Intl.DateTimeFormat`. Un `classnames` es la función `cn` de 6 líneas que ya
existe en `bv-personal-finances`.
