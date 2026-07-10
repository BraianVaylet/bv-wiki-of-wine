# syntax=docker/dockerfile:1

# Wiki of Wine — contenedor único: la API (Hono) sirve /api y el build del frontend.
# La persistencia (SQLite + fotos) vive en un volumen montado en /data.
# Multi-stage: (1) deps, (2) build del web, (3) runner slim.

# ── Base común ──
# bookworm (glibc), NO alpine: better-sqlite3 y sharp traen prebuilds para
# linux-x64-glibc y se instalan sin compilar. En musl habría que compilar.
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# ── Dependencias ──
FROM base AS deps
# Copiar solo manifests para cachear la instalación.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# ── Build del frontend (la API corre con tsx, no se bundlea) ──
FROM deps AS build
COPY . .
RUN pnpm --filter @bv/web build

# ── Runner (slim) ──
FROM base AS runner
ENV NODE_ENV=production \
    PORT=8787

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./

RUN chown -R node:node /app
USER node
WORKDIR /app/packages/api
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
