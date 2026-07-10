# 09 · Plan de acción

Fases verificables. Cada una termina con algo que **se puede probar en el navegador**,
no con "la capa X está lista".

---

## Fase 0 · Andamio (½ día)

- [ ] `pnpm-workspace.yaml`, `package.json` raíz, `tsconfig.base.json`, `biome.json`
      — copiados de `bv-personal-finances`, cambiando el nombre.
- [ ] `packages/shared` con los tipos de dominio y los primeros esquemas Zod.
- [ ] `packages/api` con Hono + `/api/health` (que hace `SELECT 1`).
- [ ] `packages/web` con Vite + React + Tailwind v4 + `styles.css` (tokens).
- [ ] `.env.example`, `.gitignore`, `Dockerfile`, `railway.json`.
- [ ] `pnpm dev` levanta las dos cosas con `concurrently`.

**Verificación:** `curl localhost:3000/api/health` → `{"status":"ok","db":"ok"}`
y la página en `:5173` muestra el logo con el acento coral.

---

## Fase 1 · Auth (1 día)

Copia casi literal de `bv-bow-sight/packages/api/src/{lib,middleware,routes/auth.ts}`
+ `bv-personal-finances/packages/web/src/{auth,theme,components/ui}`.

- [ ] Esquema `users` + `sessions`. `env.ts` con Zod.
- [ ] `hash.ts` (Argon2id), `tokens.ts` (`randomToken`, `safeEqual`), `csrf.ts`, `session.ts`.
- [ ] Middleware: `requireAuth`, `requireCsrf`, `securityHeaders`, `apiCacheControl`, `rateLimit`.
- [ ] Rutas: `register`, `login`, `logout`, `me`, `csrf`, `alias-available`, `recovery`.
- [ ] `REGISTER_ENABLED`, `MAX_USERS`, `ADMIN_ALIAS`.
- [ ] Front: `AuthShell`, `Login`, `Register`, `Recover`, `ProtectedRoute`, `ThemeProvider`,
      `AccentMenu`, `ThemeToggle`, `apiClient`, `queryClient`.
- [ ] **Tests:** los 8 de [07-testing](07-testing.md) §3 "Auth".

**Verificación:** me registro, cierro sesión, entro, el header muestra mi alias.
El bloqueo por 8 intentos fallidos funciona.

---

## Fase 2 · Catálogo, sin fotos (1½ días)

- [ ] Esquema `wineries`, `grapes`, `wines`, `wine_grapes`. Seed de ~30 uvas.
- [ ] `wineRepo` (listado con agregados, dos queries), `wineService` (ownership,
      find-or-create de bodega/uva, transacción).
- [ ] `GET/POST/PATCH/DELETE /api/wines`, `GET /api/grapes`, `GET /api/wineries`.
- [ ] Front: `WinesPage` (lista + búsqueda + filtro por tipo), `NewWinePage`,
      `WineCard`, `BottleGlyph`, `GrapeChips`, `WineTypeSelect`, FAB.
- [ ] Estados: skeleton, vacío, error.
- [ ] **Tests:** los 7 de §3 "Vinos".

**Verificación:** cargo tres vinos, los veo en la home, busco por bodega, filtro
por tinto, borro uno y desaparece. El duplicado devuelve 409 y la UI me lleva al
vino existente.

---

## Fase 3 · Reseñas (1½ días) — el corazón

- [ ] Esquema `reviews` con el índice único y los `CHECK`.
- [ ] `PUT/DELETE /api/wines/:id/review`, `GET /api/wines/:id` con agregados,
      `GET /api/me/reviews`.
- [ ] **`StarRating`** con el radiogroup accesible, teclado, `null ≠ 0`, animación
      con `prefers-reduced-motion`. Ver [05-ui](05-ui-design-system.md) §6.
- [ ] `ReviewForm`, `AxisBar`, `ScoreBadge`, `WineDetailPage`, `MyReviewsPage`.
- [ ] `useReviewMutation` con optimistic update + rollback.
- [ ] **Tests:** los 8 de §3 "Reseñas", los 7 de "Autorización", los 5 del `StarRating`.

**Verificación:** dos usuarios reseñan el mismo vino; el promedio se actualiza;
ninguno puede editar la reseña del otro; un eje sin puntuar muestra `—` y no
arrastra el promedio a la baja.

> Punto de corte. **Si acá parás, la app resuelve el problema original.** Todo lo
> que sigue es mejora.

---

## Fase 4 · Fotos (1 día)

- [ ] `sharp`. `lib/images.ts`: magic bytes, `limitInputPixels`, re-encode a WebP.
- [ ] `POST/GET/DELETE /api/wines/:id/photo`. Rate limit de upload.
- [ ] `PhotoInput` con preview `blob:`, progreso y error inline. CSP: `img-src blob:`.
- [ ] `WineCard` y `WineDetailPage` muestran la foto; `BottleGlyph` como fallback.
- [ ] **Tests:** los 6 de §3 "Fotos". Especialmente el `.txt` renombrado y el EXIF.

**Verificación:** subo una foto sacada con el celular; la card la muestra; el WebP
del disco no tiene coordenadas GPS; un `.txt` renombrado a `.jpg` da 415.

---

## Fase 5 · Deploy (½ día)

- [ ] `Dockerfile` probado localmente (`docker build && docker run`).
- [ ] Proyecto en Railway, **volumen en `/data`**, variables cargadas.
- [ ] Registrar `ADMIN_ALIAS` como primer usuario.
- [ ] **Probar el volumen:** cargar un vino → redeploy → verificar que sigue.
- [ ] `pnpm db:backup` funcionando y **una restauración probada**.
- [ ] Checklist de [06-security](06-security.md) §9 completa.
- [ ] PWA: manifest, iconos 192/512 + maskable, instalada en el celular.

---

## Fase 6 · Pulido (continuo)

- [ ] Correr las skills `web-design-guidelines` y `frontend-design` sobre las pantallas.
- [ ] `/security-review` sobre el diff completo.
- [ ] Lighthouse mobile: performance y a11y ≥ 95.
- [ ] E2E de Playwright (3 flujos).
- [ ] `REGISTER_ENABLED=false` cuando estén todos adentro.

---

## Deuda técnica consciente

Escrita para que sea una decisión, no un olvido.

| Deuda | Cuándo cobrarla |
|-------|-----------------|
| **Sin migraciones.** `CREATE TABLE IF NOT EXISTS` no altera columnas existentes. | En cuanto haya datos en prod que no quieras perder. Agregar `PRAGMA user_version` + migraciones numeradas. **Antes** del primer cambio de esquema post-deploy. |
| **`OFFSET` en el orden por puntaje.** | Si el catálogo pasa de ~5.000 vinos. Salida: columna `avg_overall` materializada por trigger. |
| **Búsqueda con `LIKE '%q%'`.** | Ídem. Salida: FTS5. |
| **Rate limiter en memoria.** | Solo si alguna vez hay 2 instancias — lo cual no debe pasar con SQLite. Probablemente nunca. |
| **Registro abierto.** | Apagarlo apenas estén todos. Ver [06-security](06-security.md) §2. |
| **Archivos huérfanos en `uploads/`** si un `unlink` falla. | Un `pnpm db:gc` que compare el directorio contra `wines.photo_file`. Cuando el volumen crezca de más. |

---

## Estimación

| Fase | Tiempo |
|------|--------|
| 0 · Andamio | 0,5 d |
| 1 · Auth | 1 d |
| 2 · Catálogo | 1,5 d |
| 3 · Reseñas | 1,5 d |
| 4 · Fotos | 1 d |
| 5 · Deploy | 0,5 d |
| **Total al MVP usable** | **~6 días** |

La mayor parte de la Fase 1 es copiar y pegar de los repos hermanos. Ese es el
retorno de haber mantenido el mismo stack.
