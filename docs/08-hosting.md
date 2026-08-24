# 08 · Hosting y despliegue — Railway

---

## 1. La regla que define todo

**SQLite es un archivo. Las fotos son archivos.** Si el filesystem es efímero —lo
normal en un PaaS— se pierde todo en cada deploy.

> **Obligatorio:** un **volumen persistente** montado en `/data`, con
> `DATABASE_PATH=/data/wow.db` y `UPLOAD_DIR=/data/uploads`.

Esto descarta Vercel, Netlify functions y cualquier runtime edge (que además no
puede correr `better-sqlite3` ni `sharp`, que son binarios nativos).

---

## 2. Una sola instancia

SQLite en WAL admite muchos lectores y **un solo escritor**. Dos réplicas de
Railway escribiendo el mismo archivo del mismo volumen se corrompen.

**No escalar horizontalmente. Réplicas = 1.** Para dos personas y decenas de vinos,
sobra: una query de la home tarda microsegundos.

Consecuencia secundaria: el rate limiter puede vivir en memoria del proceso. Con
dos instancias haría falta Redis. Otra razón para quedarse en una.

---

## 3. Configuración de Railway

`railway.json` (igual que los hermanos):

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Pasos:**

1. Nuevo proyecto desde el repo. Railway detecta el `Dockerfile`.
2. **Agregar un Volume, montarlo en `/data`.** Empezar con 1 GB.
3. Variables de entorno:

   ```
   NODE_ENV=production
   PORT=                     # Railway lo inyecta; el server DEBE leer process.env.PORT
   DATABASE_PATH=/data/wow.db
   UPLOAD_DIR=/data/uploads
   BACKUP_DIR=/data/backups
   BACKUP_RETENTION_DAYS=30
   BACKUP_SCHEDULE_HOURS=24
   SESSION_SECRET=<openssl rand -hex 32>
   COOKIE_SECURE=true
   WEB_DIST=public
   REGISTER_ENABLED=true
   MAX_USERS=10
   ADMIN_ALIAS=braian
   ```

4. Deploy. **Registrarse primero con `ADMIN_ALIAS`.**
5. **Verificar el volumen:** cargar un vino, hacer un redeploy, confirmar que sigue
   ahí. Si desaparece, el volumen no está montado y todo lo demás es humo.
6. Cuando estén todos adentro: `REGISTER_ENABLED=false` ([06-security](06-security.md) §2).

`UPLOAD_DIR` se crea con `mkdirSync(dir, { recursive: true })` al arrancar. En el
primer deploy el volumen está vacío.

---

## 4. Dockerfile

Multi-stage sobre `node:20-bookworm-slim`, adaptado del de `bv-personal-finances`.
Dos diferencias que importan:

- **La API corre con `tsx`, no bundleada** (patrón de `bv-bow-sight`).
  `better-sqlite3` y `sharp` son módulos nativos: bundlear con esbuild obliga a
  marcarlos externos y a arrastrar `node_modules` igual. No vale la complejidad.
- **`sharp` y `better-sqlite3` traen prebuilds para `linux-x64-glibc`.**
  `bookworm-slim` es glibc → instalan sin compilar. Si algún día se cambia a
  Alpine (musl), hay que instalar `build-essential python3` y compilar. **No lo hagas.**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json    packages/api/
COPY packages/web/package.json    packages/web/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @bv/web build

FROM base AS runner
ENV NODE_ENV=production PORT=8787 WEB_DIST=public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages     ./packages
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
RUN cp -r packages/web/dist packages/api/public && chown -R node:node /app
USER node
WORKDIR /app/packages/api
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
```

`USER node` — el proceso no corre como root. El volumen `/data` debe ser escribible
por ese usuario; Railway lo monta con permisos abiertos, pero conviene un
`mkdirSync` con manejo de error explícito al arrancar en vez de un crash opaco.

**Servir la SPA:** un catch-all que devuelve `index.html` para cualquier ruta que
no empiece con `/api`, con `Cache-Control: no-cache` para el `index.html` y
`immutable` para `/assets/*` (Vite les pone hash). Si `index.html` se cachea, un
deploy nuevo sirve un HTML viejo apuntando a bundles que ya no existen.

---

## 5. Backups (no es opcional)

`cp /data/wow.db backup.db` mientras la app escribe **produce un backup corrupto**:
el WAL queda a medio aplicar. Por eso
[`src/db/backup.ts`](../packages/api/src/db/backup.ts) usa `db.backup()`, la API de
backup online de SQLite que `better-sqlite3` expone: consistente aunque haya
escrituras en curso.

**Las fotos también.** El `.db` sin `/data/uploads` es una wiki de vinos sin
etiquetas. El backup es de los dos, juntos — si el `tar.gz` falla, el script borra
también el `.db` recién hecho antes de salir con error.

### 5.1 · Los comandos

```bash
pnpm db:backup                  # crea el set y aplica retención
pnpm db:restore                 # VERIFICA el último (no toca nada)
pnpm db:restore --list          # lista los sets disponibles
pnpm db:restore <stamp> --yes   # restaura de verdad, con la app detenida
```

Cada backup son tres archivos con el mismo *stamp*:

| Archivo | Qué es |
|---|---|
| `wow-<stamp>.db` | la base, ya checkpointeada (sin sidecars `-wal`/`-shm`) |
| `wow-<stamp>.uploads.tar.gz` | `uploads/` completo |
| `wow-<stamp>.manifest.json` | sha256 + bytes de los dos, y los conteos de filas |

El manifiesto es lo que hace verificable el backup: `pnpm db:restore` recalcula los
sha256 y falla ruidosamente si algo no coincide, **antes** de escribir nada. Los
conteos (`4 vinos · 6 reseñas · 5 usuarios`) te dicen de un vistazo si restauraste
lo que creías.

Variables: `BACKUP_DIR` (default `./data/backups`, en Railway `/data/backups`) y
`BACKUP_RETENTION_DAYS` (default 30). La retención **nunca borra el set más
reciente**, por viejo que sea.

Al restaurar, lo que había se mueve a `<archivo>.pre-restore-<stamp>` en vez de
pisarse. Si la restauración sale mal, los datos previos siguen ahí. Los sidecars
`-wal`/`-shm` viejos se mueven también: aplicar un WAL viejo sobre una base nueva
la corrompe, y es un error silencioso.

### 5.2 · Off-site: el bucket

> ⚠️ **`BACKUP_DIR` vive en el mismo volumen que la base.** Te salva de un borrado
> accidental o de un bug. **No te salva de perder el volumen** — que es exactamente
> lo que pasó una vez. El backup solo cuenta cuando está fuera de Railway.

Por eso `pnpm db:backup`, además de escribir local, sube los tres archivos a un
bucket S3-compatible si están las `BACKUP_S3_*`:

```
BACKUP_S3_ENDPOINT=s3.us-west-004.backblazeb2.com
BACKUP_S3_REGION=us-west-004
BACKUP_S3_BUCKET=bv-wow-backups
BACKUP_S3_ACCESS_KEY_ID=<keyID>
BACKUP_S3_SECRET_ACCESS_KEY=<applicationKey>
BACKUP_S3_PREFIX=wow
```

**Todas o ninguna**: si falta una, la app no arranca. Media configuración dejaría
`db:backup` subiendo a ningún lado sin avisar, que es el peor resultado posible.
Sin ninguna, el backup sigue funcionando local y lo dice en la salida.

La firma es [SigV4 a mano](../packages/api/src/db/remote.ts) — el SDK de AWS son
decenas de MB para un único `PUT`. Está testeada contra el vector oficial de AWS,
así que la firma es correcta contra una referencia externa y no contra sí misma.

**Elegimos B2** sobre R2 por tres razones: no pide tarjeta para el free tier de
10 GB, las llamadas API son gratis sin contar operaciones, y tiene Object Lock. El
`$0 egress` de R2 —su ventaja real— no aplica a backups, que se suben seguido y se
bajan casi nunca.

**Reglas del bucket, no del código:**

- La Application Key va **acotada al bucket**, nunca la master (que además no
  funciona con la API S3-compatible).
- La retención remota se maneja con **Lifecycle Rules** del bucket. El uploader
  solo hace `PUT`: si el contenedor se compromete, el atacante no puede vaciar los
  backups.
- **Object Lock** en el bucket es lo que cierra el círculo: objetos inmutables que
  no se borran ni con credenciales válidas.

Para bajarlos: la consola de B2, o cualquier cliente S3 (`rclone`, `s3cmd`).

Para mirar el volumen directamente hay que entrar **al contenedor**:

```bash
railway ssh
```

> ⚠️ **`railway run` NO sirve para esto.** Ejecuta el comando en tu máquina con las
> variables de Railway inyectadas — un `ls /data` con `railway run` lista el `/data`
> de tu compu (o falla), no el volumen. Para correr algo adentro del contenedor es
> `railway ssh`.

Ya dentro, las dos preguntas que importan:

```bash
ls -la /data && df -h /data
```

### 5.3 · El schedule vive dentro del proceso

> **Railway monta cada volumen en un solo servicio.** No hay forma de que un
> servicio de Cron aparte lea `/data`: vería un directorio vacío. El proceso que
> sirve la app es el único que tiene la base y las fotos.

Por eso el backup periódico corre **dentro de la API**
([`schedule.ts`](../packages/api/src/db/schedule.ts)), controlado por
`BACKUP_SCHEDULE_HOURS` (default 24, `0` apaga). Es seguro: `db.backup()` tolera
escrituras concurrentes, no hay que frenar nada.

Solo arranca con `NODE_ENV=production` — en dev el "volumen" es una carpeta local
y lo único que lograría es un backup por cada `pnpm dev` que quede abierto.

Tres propiedades que importan:

- **Nunca tira.** Un backup fallido no puede voltear el server que está sirviendo
  la app. Loguea y espera el próximo ciclo.
- **No se solapa.** Si una corrida tarda más que el intervalo, la siguiente se
  saltea en vez de pisar la anterior.
- **No hace backup de una base vacía.** Si la base no tiene usuarios, aborta y
  grita. Es la guarda contra el escenario real: el volumen se desmonta, la app
  arranca con una base en blanco, y el backup automático sube ese vacío hasta
  empujar los backups buenos fuera de la retención — perder los datos dos veces,
  la segunda para siempre.

Para una corrida manual (con `railway ssh` o en local): `pnpm db:backup`. Si la
subida falla sale con código ≠ 0, y **el backup local ya generado no se borra**.

> ⚠️ La retención guarda 30 sets completos, y cada uno incluye **todas** las fotos.
> Hoy son megabytes. Cuando el catálogo crezca, la salida es subir cada foto una
> sola vez (el nombre `uuid.webp` ya es su identidad) y guardar solo los `.db`
> históricos. No lo hagas hoy: es optimización sin medición.

### 5.4 · Probalo

**Un backup que nunca se restauró no es un backup.** El camino de cero riesgo es
`pnpm db:restore` sin `--yes`: verifica los sha256 y no escribe nada. Hacelo una
vez por mes junto con el chequeo del tamaño del volumen (§7).

La restauración completa se prueba en local: copiá los tres archivos a tu
`./data/backups`, corré `pnpm db:restore <stamp> --yes` y abrí la app.

---

## 6. Alternativas

| Servicio | Volumen | Veredicto |
|----------|---------|-----------|
| **Railway** | Sí | ✅ Recomendado. Ya lo usás en `bv-cross`. |
| **Fly.io** | Sí (Volumes / LiteFS) | ✅ Más barato. Requiere `fly.toml` y fijar 1 máquina. |
| **Render** | Disk solo en planes pagos | ⚠️ Ok si ya pagás. |
| **VPS (Hetzner)** | Disco propio | 💪 Más barato a escala. Vos gestionás TLS, backups, updates. |
| **Cloudflare Workers** | ❌ (D1) | ❌ No corre `better-sqlite3` ni `sharp`. |
| **Vercel / Netlify** | ❌ efímero | ❌ No apto. |

---

## 7. Observabilidad mínima

- Logs estructurados a stdout (Railway los recoge). Un `requestId` por request.
- **Nunca** loguear cookies, tokens, hashes ni el body de `/api/auth/*`.
- Alerta manual: revisar el tamaño del volumen una vez por mes. Con registro
  abierto, es la métrica que avisa que algo anda mal ([06-security](06-security.md) §2).
- `GET /api/health` hace `SELECT 1` real contra la DB. Un health check que solo
  devuelve `200 OK` sin tocar la base miente cuando el volumen se desmonta.
