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
el WAL queda a medio aplicar.

```ts
// packages/api/src/db/backup.ts — usa la API de backup online de SQLite
await db.backup(join(BACKUP_DIR, `wow-${new Date().toISOString()}.db`));
```

`better-sqlite3` expone `db.backup()`, que es consistente aunque haya escrituras
en curso.

**Las fotos también.** El `.db` sin `/data/uploads` es una wiki de vinos sin
etiquetas. El backup es de los dos, juntos.

Plan mínimo: un script `pnpm db:backup` que genere el `.db` + un `tar.gz` de
`uploads/`, corrido a mano antes de cada deploy grande. Plan real: un cron que lo
suba a un bucket (Backblaze B2 / R2, centavos al mes) y borre lo de más de 30 días.

**Un backup que nunca se restauró no es un backup.** Probá la restauración una vez.

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
