# 03 · API — contratos

REST sobre **Hono**. Base: `/api`. Todo JSON salvo el upload de foto (multipart)
y la descarga de foto (binario).

Autenticación por **cookie de sesión** `httpOnly` + **CSRF double-submit**.
Mismo mecanismo que `bv-personal-finances` y `bv-bow-sight` — se copia, no se reinventa.

---

## 1. Convenciones

### Errores

Forma única, siempre:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "El puntaje debe estar entre 1 y 5.", "details": { "field": "overall" } } }
```

| `code` | HTTP | Cuándo |
|--------|------|--------|
| `VALIDATION_ERROR` | 400 | Zod rechazó el body/query/params |
| `UNAUTHENTICATED` | 401 | Sin sesión o sesión vencida |
| `CSRF_INVALID` | 403 | Header ≠ cookie en una mutación |
| `FORBIDDEN` | 403 | Autenticado pero sin permiso sobre el recurso |
| `NOT_FOUND` | 404 | Recurso inexistente **o ajeno** (ver §2) |
| `CONFLICT` | 409 | Alias tomado, vino duplicado |
| `PAYLOAD_TOO_LARGE` | 413 | Body o imagen sobre el límite |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Foto que no es JPEG/PNG/WebP |
| `RATE_LIMITED` | 429 | Se pasó el límite; incluye `Retry-After` |
| `INTERNAL` | 500 | Todo lo demás. **Nunca** expone el stack |

Los mensajes son en español, orientados a la acción: *"El puntaje debe estar entre
1 y 5"*, no *"Invalid value"*.

### Reglas transversales

- **Mutaciones** (`POST`/`PUT`/`PATCH`/`DELETE`) exigen el header `x-csrf-token`
  igual a la cookie `bv_csrf`.
- **Toda** ruta bajo `/api` (menos `/api/health` y `/api/auth/*`) exige sesión.
- Respuestas de API: `Cache-Control: no-store, private` + `Vary: Cookie`.
  Sin esto, el CDN de Railway puede servirle a un usuario la home cacheada de otro.
- Validación con **Zod**, esquemas compartidos en `@bv/shared` para que front y
  back validen exactamente lo mismo.
- Fechas en la respuesta: epoch ms (`number`).

---

## 2. La regla del 404 vs 403

Para recursos **compartidos** (vinos, reseñas ajenas): son visibles para todos →
si no existe, `404`; si existe pero no sos dueño y querés mutarlo, `403 FORBIDDEN`.

Para recursos **personales** que no deberías ni saber que existen: `404`, no `403`.
En esta app no hay ninguno — todo el catálogo es público entre usuarios. Se deja
escrito para que nadie "arregle" un 403 legítimo pensando que filtra información.

---

## 3. Auth

Copiado de `bv-personal-finances/packages/api/src/routes/auth.ts`.

| Método | Ruta | Body | 200 | Notas |
|--------|------|------|-----|-------|
| `GET` | `/api/auth/csrf` | — | `{ csrfToken }` | Emite cookie `bv_csrf`. Se llama al bootear el front |
| `GET` | `/api/auth/alias-available?alias=` | — | `{ available, valid }` | Rate-limited fuerte: es un oráculo de enumeración |
| `POST` | `/api/auth/register` | `{ alias, password, securityQuestionId, securityAnswer }` | `201 { user }` | 403 si `MAX_USERS` o `REGISTER_ENABLED=false` |
| `POST` | `/api/auth/login` | `{ alias, password }` | `200 { user }` | Mensaje genérico ante fallo |
| `POST` | `/api/auth/logout` | — | `204` | Requiere CSRF. Borra la sesión del server |
| `GET` | `/api/auth/me` | — | `{ user }` | 401 si no hay sesión |
| `GET` | `/api/auth/recovery/:alias` | — | `{ question }` | 404 con mensaje neutro |
| `POST` | `/api/auth/recovery` | `{ alias, securityAnswer, newPassword }` | `{ ok: true }` | Invalida **todas** las sesiones del usuario |

`user` = `{ id, alias, isAdmin, createdAt }`. **Nunca** hashes ni respuestas de seguridad.

---

## 4. Catálogo

### `GET /api/wines`

Query params (todos opcionales):

| Param | Tipo | Default | Nota |
|-------|------|---------|------|
| `query` | string ≤ 60 | — | Busca en nombre de vino y de bodega |
| `type` | enum | — | `tinto\|blanco\|rosado\|espumante\|naranjo\|dulce` |
| `grapeId` | int | — | Filtra por uva |
| `sort` | enum | `recent` | `recent` \| `rating` |
| `limit` | int 1–50 | 20 | |
| `cursor` | string | — | Solo con `sort=recent` (keyset). Con `rating` se usa `page` |
| `page` | int ≥ 1 | 1 | Solo con `sort=rating` |

```json
{
  "items": [
    {
      "id": 12,
      "name": "Nicasia Red Blend",
      "type": "tinto",
      "vintage": 2019,
      "winery": { "id": 3, "name": "Catena Zapata" },
      "grapes": ["Malbec", "Cabernet Franc"],
      "country": "Argentina",
      "region": "Mendoza",
      "photoUrl": "/api/wines/12/photo",
      "avgOverall": 4.33,
      "reviewCount": 3,
      "reviewedByMe": true,
      "createdAt": 1751500000000
    }
  ],
  "nextCursor": "1751500000000_12"
}
```

- `avgOverall` es `null` si `reviewCount === 0`. **No es `0`.**
- `photoUrl` es `null` si el vino no tiene foto.
- `nextCursor` es `null` cuando no hay más.

### `POST /api/wines`

```json
{
  "name": "Nicasia Red Blend",
  "type": "tinto",
  "vintage": 2019,
  "wineryName": "Catena Zapata",
  "country": "Argentina",
  "region": "Mendoza",
  "grapeNames": ["Malbec", "Cabernet Franc"]
}
```

- `wineryName` y `grapeNames` son **nombres**, no ids: el server hace
  *find-or-create* (case-insensitive) dentro de la transacción. El front no
  necesita crear la bodega primero.
- `409 CONFLICT` si `(name, winery, vintage)` ya existe, con
  `details: { wineId: 12 }` para que el front ofrezca *"ir a reseñarlo"*.
- Respuesta `201` con el vino completo.

### `GET /api/wines/:id`

```json
{
  "wine": { "...": "igual que en el listado" },
  "aggregates": {
    "reviewCount": 3,
    "avgOverall": 4.33,
    "avgTaste": 4.5,
    "avgAroma": null,
    "avgBody": 3.0,
    "avgValueForMoney": 4.0
  },
  "reviews": [
    {
      "id": 7,
      "author": { "id": 2, "alias": "sofi" },
      "overall": 5,
      "taste": 5, "aroma": null, "body": 3, "valueForMoney": 4,
      "notes": "El de nuestro aniversario.",
      "createdAt": 1751500000000,
      "updatedAt": 1751500000000,
      "isMine": false
    }
  ]
}
```

`avgAroma: null` = nadie puntuó ese eje. La UI muestra `—`, no `0`.

### `PATCH /api/wines/:id`

Campos parciales del `POST`. **403** si no sos `created_by` ni admin.

### `DELETE /api/wines/:id`

Soft delete. **403** si no sos `created_by` ni admin. `204`.
La respuesta previa del front debe haber confirmado con el conteo de reseñas
que se ocultan (CU-7).

---

## 5. Foto

### `POST /api/wines/:id/photo` — `multipart/form-data`, campo `photo`

1. `Content-Length` > `MAX_UPLOAD_BYTES` (6 MB) → `413`.
2. Se leen los **magic bytes** del stream. Si no es JPEG/PNG/WebP → `415`.
   El `Content-Type` del cliente y la extensión del archivo **se ignoran**.
3. Se re-codifica con `sharp` a WebP, `fit: 'inside'`, máx 1200×1200, calidad 80.
   Re-codificar es lo que mata EXIF, payloads polyglot y bombas de descompresión.
4. Se escribe en `${UPLOAD_DIR}/${randomUUID()}.webp`. El nombre lo genera el
   server; nada del cliente toca la ruta.
5. Se actualiza `wines.photo_file` y se borra el archivo anterior (best-effort:
   si el `unlink` falla, se loguea, no se rompe la request).

`200 { photoUrl }`. **403** si no sos dueño ni admin.
Rate limit dedicado: `UPLOAD_RATE_LIMIT_MAX` por usuario por día.

### `GET /api/wines/:id/photo`

Requiere sesión (RN-1). Devuelve el binario con:

- `Content-Type: image/webp`
- `ETag` = hash del nombre de archivo (inmutable: un cambio de foto cambia el UUID)
- `Cache-Control: private, max-age=31536000, immutable`

Esta ruta es la **única excepción** a `no-store`, y es segura porque `private` +
URL con UUID irrepetible. Si algún día las fotos dejan de ser secretas, se puede
servir estático.

> El directorio de uploads **jamás** se expone con un middleware de estáticos.
> La ruta se arma como `join(UPLOAD_DIR, basename(row.photo_file))` — `basename`
> es el cinturón de seguridad contra `../../etc/passwd` aunque la DB esté sana.

### `DELETE /api/wines/:id/photo`

Quita `photo_file`, borra el archivo. `204`.

---

## 6. Reseñas

### `PUT /api/wines/:id/review` — upsert

```json
{ "overall": 4, "taste": 5, "aroma": null, "body": null, "valueForMoney": 3, "notes": "Rico, algo caro." }
```

- `overall`: entero 1–5, **obligatorio**.
- Ejes: entero 1–5 o `null`. Omitir el campo ≡ `null` (Zod `.nullish()`).
- `notes`: string ≤ 500, se guarda trimmed; `""` es válido.
- Siempre `200` con la reseña resultante. Idempotente: mandarla dos veces igual
  no cambia nada. **No existe** un 409 "ya reseñaste".
- `404` si el vino no existe o está borrado.

### `DELETE /api/wines/:id/review`

Borra **tu** reseña. `204`. `404` si no tenías.

### `GET /api/me/reviews?sort=rating|recent`

Tus reseñas con el vino embebido. Alimenta CU-8.

---

## 7. Catálogos auxiliares

| Método | Ruta | Respuesta |
|--------|------|-----------|
| `GET` | `/api/grapes` | `[{ id, name }]` — todas. Son ~30, no se pagina |
| `GET` | `/api/wineries?query=` | `[{ id, name }]` — top 10 por prefijo, para el autocomplete |

Ambas cacheables en el cliente con React Query (`staleTime: 5 min`).

---

## 8. Salud

`GET /api/health` → `200 { status: "ok", db: "ok" }`.
Hace un `SELECT 1` real contra SQLite: un health check que no toca la base miente.
Sin auth, sin CSRF. Es el `healthcheckPath` de `railway.json`.

---

## 9. Rate limits

En memoria (una sola instancia — ver [08-hosting](08-hosting.md) §2). Por IP + por usuario.

| Grupo | Límite |
|-------|--------|
| Global `/api/*` | `RATE_LIMIT_MAX` (120) / minuto |
| `/api/auth/*` | `AUTH_RATE_LIMIT_MAX` (10) / minuto |
| `POST /api/wines` | 30 / hora / usuario |
| `POST /api/wines/:id/photo` | 20 / día / usuario |

Los dos últimos existen **solo** porque el registro es abierto. Ver
[06-security](06-security.md) §2.
