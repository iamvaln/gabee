# syntax=docker/dockerfile:1
# Build context = repo root (monorepo). Build from the root:
#   docker compose build web
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
# OpenSSL is required by Prisma at runtime/codegen.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /app

# ── Build stage: install workspace deps, generate Prisma client, build Next ──
FROM base AS build
# Copy the whole monorepo (node_modules/.next/dist are excluded via .dockerignore).
COPY . .
# Be resilient to slow/flaky networks: more retries, longer timeout, fewer
# parallel sockets (avoids ERR_SOCKET_TIMEOUT on constrained links).
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    npm_config_network_concurrency=4
RUN pnpm install --frozen-lockfile
# Prisma 7 client → packages/db/src/generated/prisma (consumed via transpilePackages).
# prisma.config.ts resolves env('DIRECT_URL') at load time, even though `generate`
# never connects — pass a throwaway URL just to satisfy config loading.
RUN DIRECT_URL="postgresql://prisma:prisma@localhost:5432/prisma" \
    pnpm --filter @gabee/db run db:generate
# NEXT_PUBLIC_* values are inlined at build time, so they must be present here.
ARG NEXT_PUBLIC_KID_APP_URL
ENV NEXT_PUBLIC_KID_APP_URL=$NEXT_PUBLIC_KID_APP_URL
# `next build` loads server modules to collect route metadata; lib/server/env.ts
# throws in production if these runtime secrets are unset. They are server-only
# (never inlined into the client bundle) and the real values come from the
# container env at runtime — so pass throwaway placeholders for the build only
# (inline, not ENV, so nothing is baked into the image: runtime fail-fast stays).
RUN AUTH_JWT_SECRET="build-time-placeholder-not-used-at-runtime" \
    COPARENT_INVITE_SECRET="build-time-placeholder-not-used-at-runtime" \
    DATABASE_URL="postgresql://prisma:prisma@localhost:5432/prisma" \
    pnpm --filter @gabee/web run build

# ── Runtime stage: run `next start`. Keeps full node_modules so the Prisma CLI ──
# ── (used by the `migrate` service) and the generated client are available.   ──
FROM build AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "--filter", "@gabee/web", "start"]
