# 06 · Seguridad

Base copiada de `bv-bow-sight` / `bv-personal-finances`. Lo que sigue es lo que
**cambia** por dos decisiones de producto: **registro abierto** y **upload de imágenes**.

---

## 1. Modelo de amenaza

| Activo | Amenaza | Mitigación |
|--------|---------|------------|
| Contraseñas | Filtración de la DB | Argon2id (`@node-rs/argon2`), parámetros por defecto de la lib |
| Sesiones | Robo de cookie vía XSS | Cookie `httpOnly` + `SameSite=Lax` + `secure` en prod. CSP sin `unsafe-eval` |
| Sesiones | CSRF | Double-submit: cookie `bv_csrf` (no httpOnly) + header `x-csrf-token`, comparados en tiempo constante |
| Catálogo compartido | Vandalismo (borrar vinos ajenos) | Ownership en el servicio + soft delete de vinos |
| Reseñas | Edición de la opinión ajena | `UNIQUE(wine_id, user_id)` + `user_id` **del contexto de sesión**, nunca del body |
| Volumen `/data` | Subida de contenido ilegal / bomba de descompresión | Re-codificación con `sharp`, límite de tamaño, rate limit, `MAX_USERS` |
| La app entera | Registro masivo de bots | `MAX_USERS`, `REGISTER_ENABLED`, rate limit de auth |

---

## 2. ⚠️ Registro abierto: la deuda que asumimos

Cualquier persona con la URL puede crear una cuenta, escribir en el catálogo
compartido y **escribir archivos en tu disco**. Eso es cualitativamente distinto
de `bv-personal-finances` (registro por token, `MAX_USERS=2`).

**Mitigaciones obligatorias — ninguna es opcional:**

1. **`MAX_USERS` como circuit breaker.** Con `MAX_USERS=50`, un ataque de registro
   masivo se detiene en el usuario 51. Es el freno de mano, no la seguridad.
2. **`REGISTER_ENABLED`.** Un booleano de env. Cuando estén todos adentro, se
   apaga. **Esta es la verdadera defensa.** El registro abierto es una fase, no
   un estado permanente.
3. **Rate limit de auth** (`AUTH_RATE_LIMIT_MAX=10/min` por IP) y de creación
   (30 vinos/hora, 20 fotos/día por usuario).
4. **Nada de lectura anónima** (RN-1). Sin sesión no se ve ni un vino ni una foto.
   Esto evita que la app se convierta en hosting de imágenes públicas.
5. **Un admin.** `ADMIN_ALIAS` recibe `is_admin=1` al registrarse. Es quien limpia.
6. **El upload de fotos requiere sesión y ownership del vino.** No se puede subir
   una foto a un vino ajeno.

**Lo que sigue expuesto y hay que aceptar conscientemente:**

- No hay email → **no hay verificación ni forma de contactar/banear a alguien**.
  El único remedio es el borrado por admin.
- No hay captcha. Un bot con un browser headless puede registrarse. `MAX_USERS`
  lo acota; no lo impide.
- Un usuario puede subir hasta 20 imágenes/día × 1200×1200 WebP ≈ 5 MB/día.
  Con 50 usuarios, el peor caso es ~250 MB/día contra tu volumen de Railway.
  **Monitoreá el tamaño del volumen.**

> **Recomendación explícita:** arrancá con `REGISTER_ENABLED=true` y `MAX_USERS=10`,
> invitá a quien quieras, y apagá el registro. Todo el riesgo de esta sección se
> evapora en ese momento. Si más adelante querés abrirlo de verdad, hace falta
> email verificado + captcha, y eso es otro proyecto.

---

## 3. Autenticación

- **Hash:** Argon2id. Nunca bcrypt-sha1, nunca `crypto.pbkdf2` a mano.
- **Sesiones opacas** en la tabla `sessions`, **hasheadas** (`token_hash`): si
  alguien lee la DB, no puede reusar las sesiones. El token en claro solo vive en
  la cookie del cliente.
- **Comparaciones en tiempo constante** (`safeEqual`) para tokens CSRF y de sesión.
- **Bloqueo por fuerza bruta:** `failed_attempts` + `locked_until` en `users`.
  8 intentos → 15 min. El contador se resetea en login exitoso.
- **Enumeración de usuarios:**
  - Login: un solo mensaje, *"Alias o contraseña incorrectos."*
  - Recuperación: `404` con texto neutro.
  - `GET /auth/alias-available` **sí** revela existencia — es inevitable en un
    registro con alias único. Se compensa con rate limit agresivo (10/min).
- **Reseteo de contraseña** invalida **todas** las sesiones del usuario
  (`DELETE FROM sessions WHERE user_id = ?`).
- **Pregunta de seguridad:** la respuesta se hashea con Argon2 igual que la
  contraseña, y se normaliza (`trim().toLowerCase()`) antes de hashear.

---

## 4. Autorización

Una sola fuente de verdad: **el `userId` sale de la sesión**, jamás del body ni
de la query. Buscar `user_id` en un `req.body` es un bug de seguridad, no un atajo.

| Recurso | Crear | Leer | Editar | Borrar |
|---------|-------|------|--------|--------|
| Vino | cualquier usuario | cualquier usuario | `created_by` o admin | `created_by` o admin (soft) |
| Foto | dueño del vino o admin | cualquier usuario | ídem | ídem |
| Reseña | cualquier usuario (la suya) | cualquier usuario | **solo el autor** o admin | **solo el autor** o admin |
| Bodega / uva | cualquier usuario | cualquier usuario | admin | admin |

El check vive en `services/`, antes de tocar el repositorio. Ver
[04-architecture](04-architecture.md) §3.

---

## 5. Upload de imágenes — el punto más delicado

Un endpoint que escribe archivos en tu servidor a pedido de un desconocido.
El orden de las verificaciones importa:

```
1. requireAuth           → hay sesión
2. requireCsrf           → no es una request cross-site
3. rate limit de upload  → no está inundando
4. ownership del vino    → puede tocar ESE vino
5. Content-Length        → 413 antes de leer un byte del body
6. magic bytes           → 415 si no es JPEG/PNG/WebP real
7. sharp: re-encode      → WebP, fit inside 1200×1200, q80
8. escritura             → ${UPLOAD_DIR}/${randomUUID()}.webp
```

### Las trampas concretas

- **El `Content-Type` del cliente miente.** Un `.php` renombrado a `.jpg` con
  `Content-Type: image/jpeg` pasa cualquier validación por extensión o header.
  Se leen los **primeros bytes del archivo**: `FF D8 FF` (JPEG), `89 50 4E 47`
  (PNG), `RIFF….WEBP`.
- **Re-codificar no es opcional, es la defensa principal.** Un archivo que
  `sharp` decodifica y vuelve a codificar deja de ser un polyglot, pierde el EXIF
  (incluida la **geolocalización de tu casa**) y no puede llevar payload.
- **Bombas de descompresión:** `sharp` con
  `{ limitInputPixels: 100_000_000, failOn: 'truncated' }` corta un PNG de
  `50000×50000` que se expandiría a decenas de GB de RAM.
- **Path traversal:** el nombre lo genera el server (`randomUUID()`). Al leer,
  `join(UPLOAD_DIR, basename(row.photo_file))`. `basename` incluso si la DB
  estuviera envenenada.
- **El directorio de uploads nunca se sirve estático.** Toda lectura pasa por
  `GET /api/wines/:id/photo`, que exige sesión.
- **`unlink` del archivo viejo es best-effort:** si falla, se loguea y la request
  igual responde 200. Un archivo huérfano es un problema de disco, no de
  corrección. Un `db:gc` puede barrerlos.

---

## 6. OWASP Top 10 — dónde se aborda cada uno

| # | Riesgo | Dónde |
|---|--------|-------|
| A01 | Broken Access Control | §4. Ownership en `services/`. `userId` de la sesión. |
| A02 | Cryptographic Failures | §3. Argon2id, tokens de 24B de `crypto.randomBytes`, sesiones hasheadas. HSTS en prod. |
| A03 | Injection | Statements preparados de `better-sqlite3` con parámetros nombrados. **Cero concatenación de SQL**, incluido el `IN (...)` ([02-data-model](02-data-model.md) §6.1). XSS: React escapa por defecto; ni un `dangerouslySetInnerHTML`. |
| A04 | Insecure Design | §2. El registro abierto está documentado como riesgo con su plan de cierre. |
| A05 | Security Misconfiguration | `env.ts` con Zod aborta el arranque si falta `SESSION_SECRET` en prod. Headers de seguridad en todas las respuestas (§7). |
| A06 | Vulnerable Components | 6 deps de runtime en la API. `pnpm audit` en CI. Renovate/Dependabot semanal. |
| A07 | Auth Failures | §3. Bloqueo por intentos, rate limit, mensajes genéricos. |
| A08 | Data Integrity | Sin deserialización insegura. Lockfile commiteado (`--frozen-lockfile` en Docker). |
| A09 | Logging Failures | Se loguea: alias, ruta, status, latencia. **Nunca**: contraseñas, tokens, hashes, cookies, el body de auth. En error 500 se loguea el stack **del lado del server**; el cliente recibe `{ code: "INTERNAL" }`. |
| A10 | SSRF | No hay ninguna request saliente. La app no fetchea URLs del usuario. Por eso se descartó "URL de imagen externa". |

---

## 7. Headers

Copiados de `bv-bow-sight/src/middleware/security.ts`, con un cambio:

```ts
"default-src 'self'",
"img-src 'self' data: blob:",   // ← blob: para el preview de PhotoInput
"style-src 'self' 'unsafe-inline'",
"script-src 'self'",
"connect-src 'self'",
"object-src 'none'",
"frame-ancestors 'none'",
"base-uri 'self'",
```

`blob:` es necesario para `URL.createObjectURL(file)` en el preview antes de subir.
Es el mínimo incremento: no habilita cargar imágenes de terceros.

Más: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`
y `Strict-Transport-Security` en prod.

> `Permissions-Policy: camera=()` **no** rompe `<input capture="environment">`:
> eso abre la cámara del SO, no `getUserMedia`.

**Cache-Control:** `no-store, private` + `Vary: Cookie` en todo `/api`, con la
única excepción de `GET /api/wines/:id/photo`. Sin esto, el edge de Railway
puede servirle a un usuario la respuesta cacheada de otro.

---

## 8. Secretos

- `SESSION_SECRET`: `openssl rand -hex 32`. Solo en variables de entorno de Railway.
- `.env` en `.gitignore`. `.env.example` sin valores reales.
- **Cero secretos en el bundle del front.** Todo lo que arranca con `VITE_` es
  público por definición.
- Rotar `SESSION_SECRET` invalida todas las sesiones. Es la feature, no el bug.

---

## 9. Antes de exponer la URL

- [ ] `REGISTER_ENABLED` y `MAX_USERS` seteados con criterio.
- [ ] `ADMIN_ALIAS` definido y esa cuenta creada primero.
- [ ] `SESSION_SECRET` real, `COOKIE_SECURE=true`, `NODE_ENV=production`.
- [ ] Volumen montado y verificado: redeploy → los datos siguen ahí.
- [ ] Backup automático del `.db` funcionando ([08-hosting](08-hosting.md) §5).
- [ ] `pnpm audit` limpio.
- [ ] Probado a mano: usuario A **no** puede editar la reseña de B (403).
- [ ] Probado a mano: subir un `.txt` renombrado a `.jpg` → 415.
- [ ] Correr la skill `/security-review` sobre el diff.
