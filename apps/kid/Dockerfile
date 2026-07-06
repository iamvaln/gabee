# syntax=docker/dockerfile:1
# Build context = repo root (monorepo). The kid app is a static PWA: it is built
# with Vite and served by nginx. The API base URL is baked at build time.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
# Be resilient to slow/flaky networks (avoids ERR_SOCKET_TIMEOUT on slow links).
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    npm_config_network_concurrency=4
RUN pnpm install --frozen-lockfile
# VITE_* values are inlined at build time → must be set before `vite build`.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# Release version (the git tag) — surfaced in Settings → About.
ARG VITE_APP_VERSION
ENV VITE_APP_VERSION=$VITE_APP_VERSION
# Sentry DSN (optional) — inlined at build time; empty → Sentry is a no-op.
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
# Sentry source-map upload (optional) — org token + org/project read at build
# time by @sentry/vite-plugin. All empty → plugin not added, no maps emitted.
# ARGs only, passed inline to the RUN (not ENV) so the write-scoped token never
# lands in any image layer's env — even though the nginx runtime stage already
# discards it, this keeps the build stage clean + silences SecretsUsedInArgOrEnv.
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
RUN SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" \
    SENTRY_ORG="$SENTRY_ORG" \
    SENTRY_PROJECT="$SENTRY_PROJECT" \
    pnpm --filter @gabee/kid run build

# ── Serve the static bundle ──
FROM nginx:1.27-alpine AS runtime
COPY apps/kid/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/kid/dist /usr/share/nginx/html
EXPOSE 80
