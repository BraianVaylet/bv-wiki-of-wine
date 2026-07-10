<p align="center">
  <img src="assets/bv-wow-mini-svg.svg" width="120" alt="Wiki of Wine" />
</p>

<h1 align="center">BV Wiki of Wine</h1>

<p align="center">
  Una wiki privada de vinos. Cargás el vino una vez; cada quien deja su reseña;<br/>
  todos ven la de todos. Para acordarse de cuál ya probaron y si les gustó.
</p>

---

## Qué es

Web app **mobile-first** (PWA instalable) para una pareja y su círculo. No es
Vivino ni CellarTracker: no hay catálogo global, ni inventario de bodega, ni
sommeliers. Hay un catálogo chico, compartido, donde el valor está en que
**conocés a las personas que reseñaron**.

- **★ 1–5 global** obligatorio: un tap y listo.
- **Ejes opcionales**: gusto, aroma, cuerpo, precio/calidad.
- Nota libre, foto de la etiqueta, uvas, bodega, cosecha.
- Todo el feedback es visible para todos los usuarios.

## Stack

| Capa | Elección |
|------|----------|
| Front | React 18 · Vite · Tailwind v4 · React Query · React Router |
| Back | Node 20 · Hono · Zod |
| Datos | SQLite (`better-sqlite3`) — como `bv-cross` y `bv-bow-sight` |
| Imágenes | `sharp` (re-codificación a WebP) |
| Auth | Cookie de sesión `httpOnly` + CSRF double-submit + Argon2id |
| Deploy | Docker → Railway, con volumen persistente en `/data` |

Sistema de diseño, tema y componentes base **copiados** de
[`bv-personal-finances`](../bv-personal-finances) y
[`bv-my-investments`](../bv-my-investments): mismos tokens, mismo acento coral
(`#C96442`), misma clave de `localStorage`.

## Documentación

| Doc | Contenido |
|-----|-----------|
| [00 · Investigación](docs/00-research.md) | Vivino, CellarTracker, Delectable. Qué copiar, qué evitar. Anti-alcance. |
| [01 · Funcional](docs/01-functional-spec.md) | Actores, casos de uso, reglas de negocio. |
| [02 · Modelo de datos](docs/02-data-model.md) | Esquema SQLite, consultas, paginación, backups. |
| [03 · API](docs/03-api-spec.md) | Endpoints, contratos, códigos de error. |
| [04 · Arquitectura](docs/04-architecture.md) | Monorepo, capas, decisiones y trade-offs. |
| [05 · Diseño y UI](docs/05-ui-design-system.md) | Tokens, logo, `StarRating`, layouts, a11y. |
| [06 · Seguridad](docs/06-security.md) | Registro abierto, uploads, OWASP Top 10. |
| [07 · Testing](docs/07-testing.md) | Qué se testea y por qué. |
| [08 · Hosting](docs/08-hosting.md) | Railway, volumen, Dockerfile, backups. |
| [09 · Plan de acción](docs/09-action-plan.md) | Fases, verificación, deuda consciente. |

## Setup

```bash
pnpm install
cp .env.example .env          # completar SESSION_SECRET
pnpm db:seed                  # ~30 uvas + datos demo en development
pnpm dev                      # API :3000 + web :5173
```

**Paso no obvio:** `better-sqlite3` y `sharp` son módulos nativos. Necesitás
Node 20 y, en Windows, las build tools de Visual Studio (o dejar que `pnpm` baje
los prebuilds, que es lo normal). En Docker usamos `node:20-bookworm-slim`
(glibc) justamente para que instalen sin compilar.

**El primer usuario que se registre con el alias de `ADMIN_ALIAS` recibe permisos
de admin.** Registralo antes de compartir la URL.

## Scripts

| Comando | Qué hace |
|---------|----------|
| `pnpm dev` | API + web en paralelo |
| `pnpm build` | Build de los tres paquetes |
| `pnpm test` | Vitest en los tres paquetes |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | `biome check .` |
| `pnpm db:seed` / `db:reset` | Semillas / recrear la DB (bloqueado en producción) |
| `pnpm db:backup` | Backup consistente del `.db` + `uploads/` |

## Estado

📐 **En diseño.** La documentación está completa; la implementación arranca por la
[Fase 0](docs/09-action-plan.md#fase-0--andamio-½-día).

## Licencia

MIT — ver [LICENSE](LICENSE).
