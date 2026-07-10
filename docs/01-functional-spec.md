# 01 · Especificación funcional — BV Wiki of Wine

**Qué es:** una wiki privada de vinos. Cargás un vino una vez; cualquier usuario
puede dejar su reseña; todos ven las reseñas de todos.

**Para quién:** una pareja y su círculo. Decenas de usuarios, cientos de vinos.
No miles.

**Plataforma:** PWA mobile-first, instalable. Se usa parado en una vinoteca o
sentado en una mesa, con una mano.

---

## 1. Actores

| Actor | Puede |
|-------|-------|
| **Anónimo** | Registrarse, iniciar sesión, recuperar contraseña. Nada más: **no** ve el catálogo. |
| **Usuario** | Ver todo el catálogo y todas las reseñas. Crear vinos. Editar/borrar **los vinos que creó** y **su propia reseña**. |
| **Admin** | Todo lo del usuario + editar/borrar cualquier vino, cualquier reseña, y cualquier foto. Se designa por variable de entorno (`ADMIN_ALIAS`). |

> El registro es **abierto**. Eso implica que un desconocido puede crear vinos y
> subir fotos. Las mitigaciones son obligatorias, no opcionales: ver
> [06-security](06-security.md) §2.

---

## 2. Modelo mental

```
Vino (compartido, uno solo)
 ├── nombre, bodega, tipo, uvas[], cosecha, país/región, foto
 └── Reseñas (una por usuario)
      ├── ★ puntaje global   1..5   (obligatorio)
      ├── gusto              1..5   (opcional)
      ├── aroma              1..5   (opcional)
      ├── cuerpo             1..5   (opcional)
      ├── precio/calidad     1..5   (opcional)
      └── nota libre         texto  (opcional, ≤ 500)
```

**Regla central:** el vino es un objeto **compartido**; la reseña es **personal**.
Nadie edita la reseña de otro. Todos leen las de todos.

**El puntaje del vino** que se muestra en la home es `AVG(reseñas.puntaje_global)`
junto con la cantidad de reseñas. **No** es el promedio de los ejes: la estrella
global es un juicio, no una fórmula. Si alguien pone ★5 global y ★2 en precio,
eso significa "es caro y lo vale" — la fórmula lo destruiría.

---

## 3. Casos de uso

### CU-1 · Registrarse
Alias (3–24, único, case-insensitive), contraseña (≥ 10 chars), pregunta de
seguridad + respuesta (para recuperar sin email).
Sin email → **no hay verificación ni reseteo por link**. Es el precio de no
depender de un proveedor de correo. Igual que `bv-personal-finances` y `bv-bow-sight`.

- Falla si el alias existe → 409 con mensaje accionable ("Ese alias ya está tomado").
- Falla si se alcanzó `MAX_USERS` → 403.
- Falla si `REGISTER_ENABLED=false` → 403.

### CU-2 · Iniciar sesión
Alias + contraseña. Tras `LOGIN_MAX_ATTEMPTS` fallos, la cuenta se bloquea
`LOGIN_LOCK_MINUTES`. El mensaje de error **no** distingue "alias inexistente" de
"contraseña incorrecta" (enumeración de usuarios).

### CU-3 · Ver el catálogo (home)
Lista de vinos ordenada por **recientes** (default) o **mejor puntuados**.

Cada card muestra: foto (o placeholder), nombre, bodega, chips de uvas, tipo,
cosecha, ★ promedio + `(n)` reseñas, y un indicador de **"ya lo reseñaste"**.

Filtros: búsqueda por texto (nombre o bodega), tipo, uva.
Estado vacío: "Todavía no hay vinos. Cargá el primero."

### CU-4 · Cargar un vino
Formulario:

| Campo | Obligatorio | Regla |
|-------|-------------|-------|
| Nombre | ✔ | 1–120 chars, trim |
| Bodega | — | autocomplete sobre bodegas existentes; permite crear al vuelo |
| Tipo | ✔ | uno de los 6 |
| Uvas | — | multi-select sobre el catálogo semilla; permite crear al vuelo; máx 5 |
| Cosecha | — | entero 1900–(año actual + 1) |
| País / Región | — | texto libre, ≤ 60 |
| Foto | — | JPEG/PNG/WebP, ≤ 6 MB. Se re-codifica a WebP en el server |

**Anti-duplicado:** la terna `(nombre, bodega, cosecha)` es única (case-insensitive,
ignorando vinos borrados). Si ya existe, la API responde 409 y el front ofrece
*"Ese vino ya está cargado — ir a reseñarlo"*. No bloqueamos, redirigimos.

Al guardar, el creador va directo a la pantalla de reseña. Cargar un vino sin
opinarlo no tiene sentido para el usuario.

### CU-5 · Reseñar un vino
Una reseña por usuario por vino. La operación es un **upsert**: si ya existe, se
actualiza. Nunca hay un 409 "ya reseñaste".

- ★ global (1–5) es lo único obligatorio. Un tap y listo.
- Los 4 ejes arrancan sin valor (`—`) y se pueden dejar así. Cada uno se puede
  limpiar volviendo a `—`.
- Nota libre ≤ 500 chars, con contador visible a partir de 400.
- Guardado con **optimistic update**: la estrella se pinta al instante, se
  revierte con toast de error si el server rechaza.

### CU-6 · Ver el detalle de un vino
Foto grande, ficha, y la lista de **todas** las reseñas: alias del autor, sus
estrellas por eje, su nota, la fecha. La propia va primero y es editable inline.

Agregados por eje: promedio de `gusto`, `aroma`, `cuerpo`, `precio/calidad`
calculado **solo sobre quienes puntuaron ese eje** (los `NULL` no cuentan ni como
0 ni como 3). Se muestra `— sin datos` si nadie lo puntuó.

### CU-7 · Editar / borrar
- Vino: creador o admin. El borrado es **soft** (`deleted_at`): las reseñas
  sobreviven pero el vino desaparece del catálogo. Confirmación con `ConfirmDialog`
  que avisa cuántas reseñas se ocultan.
- Reseña: solo su autor (o admin). Borrado duro.
- Foto: reemplazar o quitar. El archivo viejo se borra del disco.

### CU-8 · Mis reseñas
Lista de los vinos que **yo** reseñé, ordenada por puntaje. Responde la pregunta
original: *"¿esto ya lo tomamos y me gustó?"*.

---

## 4. Reglas de negocio

| ID | Regla |
|----|-------|
| RN-1 | Todo endpoint de datos requiere sesión. No hay lectura anónima. |
| RN-2 | Una reseña por `(vino, usuario)`. Garantizado por índice único, no solo por código. |
| RN-3 | `puntaje_global` ∈ {1,2,3,4,5}. Los ejes ∈ {1..5} ∪ {NULL}. **Nunca 0.** |
| RN-4 | Un vino borrado no aparece en listados ni se puede reseñar, pero su detalle sigue accesible por link directo para el admin. |
| RN-5 | Borrar un usuario borra sus reseñas (`ON DELETE CASCADE`) pero **no** los vinos que creó (`created_by` queda en NULL… ver [02-data-model](02-data-model.md) §3 — decisión: los vinos son de la comunidad). |
| RN-6 | Un vino puede tener 0 reseñas (recién creado). El promedio es `NULL`, la UI muestra "Sin reseñas". |
| RN-7 | Máximo 5 uvas por vino. Es un blend, no un experimento. |

---

## 5. Estados de la UI (los cuatro, siempre)

Para **cada** pantalla que trae datos:

1. **Cargando** — skeleton con la forma del contenido real (no spinner centrado).
2. **Vacío** — ilustración SVG + texto + CTA. Nunca una lista en blanco.
3. **Error** — qué pasó + botón *Reintentar*. Nunca un throw silencioso.
4. **Con datos** — el happy path.

---

## 6. Fuera de alcance (MVP)

Ver [00-research](00-research.md) §6. Lo más pedido y postergado:

- **Wishlist** ("quiero probar"). Es una tabla `wishlist(user_id, wine_id)` y una
  ruta. Barato, pero no resuelve el problema declarado. Fase 2.
- **Compartir un vino por link público.** Requiere repensar RN-1.
- **Estadísticas** ("tu uva favorita"). Lindo, no urgente.
