# 07 · Testing

**Vitest** en los tres paquetes. **Testing Library** en el front. Playwright para
un puñado de flujos E2E. Igual que `bv-personal-finances`.

Principio: se testea **comportamiento observable**, no implementación. Un test que
se rompe cuando renombrás una función privada es un test malo.

---

## 1. Qué se testea y qué no

| Se testea | No se testea |
|-----------|--------------|
| Reglas de negocio y autorización (`services/`) | Que Hono rutee |
| Restricciones de la DB (`UNIQUE`, `CHECK`, `CASCADE`) | Que `better-sqlite3` funcione |
| Esquemas Zod: entradas válidas **e inválidas** | Que Zod funcione |
| Contratos de la API: status + forma del body + shape del error | El HTML exacto de un componente |
| `StarRating`: teclado, ARIA, `null` ≠ `0` | Los `className` de Tailwind |
| Cálculo de agregados con `NULL` de por medio | |

---

## 2. API — base de datos real en memoria

Nada de mocks del repositorio. Cada test crea su propia DB:

```ts
// tests/helpers.ts
export function testDb(): DB {
  return createDb(':memory:');   // aplica SCHEMA_SQL, PRAGMAs incluidos
}
```

Rápido (µs), determinista, aislado, y **ejercita las constraints de verdad**.
Mockear el repo testearía el mock.

`app.ts` exporta una factory `createApp(deps)`; los tests la llaman con su `db`
y usan `app.request(...)` de Hono. Sin puerto, sin `supertest`.

---

## 3. Casos que deben existir

### Autorización (los que más importan)

```
✔ un usuario no puede editar la reseña de otro usuario → 403
✔ un usuario no puede editar un vino que no creó → 403
✔ un admin sí puede editar un vino ajeno → 200
✔ un usuario no puede subir una foto a un vino ajeno → 403
✔ el user_id del body se ignora: la reseña se crea a nombre de la sesión
✔ una request sin cookie de sesión a /api/wines → 401
✔ una mutación sin header x-csrf-token → 403 CSRF_INVALID
```

Ese quinto caso — **"el `user_id` del body se ignora"** — es el test que atrapa la
vulnerabilidad más fácil de introducir en un refactor.

### Reseñas

```
✔ PUT /wines/:id/review dos veces con el mismo usuario actualiza, no duplica (upsert)
✔ overall = 0 → 400 VALIDATION_ERROR
✔ overall = 6 → 400
✔ taste = null se persiste como NULL y no como 0
✔ el promedio de aroma ignora las reseñas con aroma NULL
✔ un vino sin reseñas devuelve avgOverall: null, no 0
✔ notes de 501 chars → 400
✔ reseñar un vino borrado (deleted_at) → 404
```

### Vinos

```
✔ crear un vino con (nombre, bodega, cosecha) repetidos → 409 con details.wineId
✔ el 409 no se dispara si el duplicado está soft-deleted
✔ crear un vino con una bodega nueva la crea (find-or-create)
✔ crear un vino con 6 uvas → 400
✔ si el insert de wine_grapes falla, no queda el vino sin uvas (transacción)
✔ borrar un vino lo saca del listado pero conserva sus reseñas en la DB
✔ el listado no dispara N+1: una query de vinos + una de uvas
```

### Fotos

```
✔ un .txt renombrado a .jpg → 415 (magic bytes)
✔ Content-Length > MAX_UPLOAD_BYTES → 413 sin leer el body
✔ un JPEG con EXIF GPS: el WebP resultante no tiene EXIF
✔ reemplazar la foto borra el archivo anterior del disco
✔ GET /wines/:id/photo sin sesión → 401
✔ photo_file con "../../etc/passwd" en la DB no escapa de UPLOAD_DIR
```

El de EXIF y el de path traversal parecen paranoia. Son exactamente los dos que
un refactor "que simplifica el upload" rompe sin que nadie lo note.

### Auth

```
✔ registrar dos veces el mismo alias (distinto case) → 409
✔ registro con MAX_USERS alcanzado → 403
✔ registro con REGISTER_ENABLED=false → 403
✔ el alias de ADMIN_ALIAS recibe is_admin = 1
✔ login con alias inexistente y con contraseña mala devuelven el MISMO mensaje
✔ tras LOGIN_MAX_ATTEMPTS fallos, el login correcto también falla (bloqueado)
✔ resetear la contraseña borra todas las sesiones del usuario
✔ ninguna respuesta de /api/auth/* incluye password_hash ni security_answer_hash
```

---

## 4. Front

### `StarRating` (el componente crítico)

```
✔ renderiza 5 radios con nombre accesible "N de 5 estrellas"
✔ flecha derecha mueve la selección de 3 a 4
✔ seleccionar la opción "—" emite onChange(null), no onChange(0)
✔ en modo readonly no hay elementos enfocables
✔ con prefers-reduced-motion, no aplica la clase de escala
```

### Otros

- `WineForm`: submit con nombre vacío → mensaje inline + foco en el campo.
- `useReviewMutation`: `onError` revierte el optimistic update.
- `apiClient`: un 401 limpia la caché de React Query.

**MSW** para interceptar `fetch`. Nada de mockear `apiClient` — eso testea el mock.

---

## 5. E2E (Playwright) — solo lo que vale su costo

Tres flujos. Corren contra la app real con una DB temporal.

1. **Registro → cargar un vino → puntuarlo → verlo en la home con ★.**
2. **Dos usuarios:** A crea y reseña; B entra, ve la reseña de A, agrega la suya;
   el promedio se actualiza; B no ve botón de editar en la reseña de A.
3. **Subir una foto** y verla en la card.

No más. Los E2E son lentos y frágiles: son la red de seguridad de los caminos
críticos, no una segunda suite de unit tests.

---

## 6. Determinismo

- **Reloj:** los servicios reciben `now: () => number` (ya existe `lib/time.ts` en
  los hermanos). Los tests inyectan un `now` fijo. Cero `vi.useFakeTimers()` disperso.
- **Ids:** `randomUUID` se inyecta igual en el servicio de imágenes.
- **DB:** una por test, `:memory:`. Sin estado compartido entre tests.
- **Red:** ninguna. La API no hace requests salientes ([06-security](06-security.md) §6, A10).
- `pnpm -r --workspace-concurrency=1 test` — como en `bv-personal-finances`.

---

## 7. Cobertura

No hay número mágico. La regla es:

> **Todo `if` que decide un permiso tiene un test que lo toma por cada rama.**

Si eso se cumple, el porcentaje da lo que da. Un 90% de cobertura sin el test de
"A no edita la reseña de B" es peor que un 60% con él.

---

## 8. CI

```yaml
pnpm install --frozen-lockfile
pnpm lint          # biome check
pnpm typecheck     # tsc --noEmit en los 3 paquetes
pnpm test          # vitest run
pnpm audit --prod  # falla el build si hay CVE alta
pnpm build
```

`sharp` y `better-sqlite3` son deps nativas: el runner de CI tiene que ser
`ubuntu-latest` con Node 20, la misma base que el Dockerfile. Un binario compilado
en macOS no sirve en el contenedor.
