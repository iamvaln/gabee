#!/usr/bin/env bash
# Ephemeral, isolated DAST target: throwaway Postgres + gabee-web (noop email +
# fresh DB + tester A/B fixtures). NEVER prod, NEVER real mail — enforced below.
#
# Deviates from the original sketch: migrate/seed run from the HOST toolchain,
# not a node:20-alpine container with the repo bind-mounted in. packages/db's
# native deps (Prisma query engine, esbuild/tsx, @prisma/adapter-pg) are
# darwin-arm64 binaries and do not run under linux/alpine. So: Postgres is
# published to the host (127.0.0.1:$PG_HOST_PORT) purely so `prisma migrate
# deploy` / the seed scripts can run natively from the host; the web container
# then reaches Postgres by container name over the dedicated docker network
# (container-to-container traffic uses Postgres's own port 5432, not the
# host-published port).
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)" || exit 2
cd "$ROOT" || exit 2

PORT="${SEC_TARGET_PORT:-3999}"
PG_HOST_PORT="${SEC_TARGET_PG_PORT:-5433}"
DB_NAME="gabee_sec_test"                # MUST end in _test — safety guard below
EMAIL_PROVIDER_VALUE="noop"             # MUST be noop — safety guard below
PG_CT="gabee-sec-pg"; WEB_CT="gabee-sec-web"; NET="gabee-sec-net"
IMAGE="gabee-sec-web:latest"
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

# Refuse to run against anything that isn't an obviously disposable target,
# no matter how the constants above get edited later.
guard() {
  case "$DB_NAME" in
    *_test) ;;
    *) echo "refusing: DB name '$DB_NAME' must end in _test" >&2; exit 2;;
  esac
  [ "$EMAIL_PROVIDER_VALUE" = "noop" ] || { echo "refusing: EMAIL_PROVIDER must be noop" >&2; exit 2; }
}

wait_for_pg() {
  for _ in $(seq 1 30); do
    docker exec "$PG_CT" pg_isready -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

wait_for_health() {
  for _ in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

teardown() {
  docker rm -f "$WEB_CT" "$PG_CT" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}

up() {
  guard
  docker network create "$NET" >/dev/null 2>&1 || true

  docker run -d --name "$PG_CT" --network "$NET" \
    -p "127.0.0.1:${PG_HOST_PORT}:5432" \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="$DB_NAME" \
    postgres:16-alpine >/dev/null || { echo "postgres container failed to start" >&2; teardown; exit 1; }

  wait_for_pg || { echo "postgres never became ready" >&2; teardown; exit 1; }

  HOST_DB_URL="postgresql://postgres:postgres@127.0.0.1:${PG_HOST_PORT}/${DB_NAME}"
  CT_DB_URL="postgresql://postgres:postgres@${PG_CT}:5432/${DB_NAME}"

  # migrate + curriculum seed + tester A/B fixtures — from the HOST toolchain
  # (native Prisma/tsx binaries), against the host-published port.
  if ! DIRECT_URL="$HOST_DB_URL" DATABASE_URL="$HOST_DB_URL" \
      pnpm --filter @gabee/db run db:migrate:deploy >&2; then
    echo "migrate deploy failed" >&2; teardown; exit 1
  fi
  if ! DIRECT_URL="$HOST_DB_URL" DATABASE_URL="$HOST_DB_URL" \
      pnpm --filter @gabee/db run db:seed >&2; then
    echo "curriculum seed failed" >&2; teardown; exit 1
  fi
  if ! STAGING_FIXTURES=1 DIRECT_URL="$HOST_DB_URL" DATABASE_URL="$HOST_DB_URL" \
      pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts >&2; then
    echo "fixture seed failed" >&2; teardown; exit 1
  fi

  # Build the web image if it isn't already there. NEXT_PUBLIC_* values are
  # inlined at build time; dummy localhost values are fine because the target
  # is only ever probed on 127.0.0.1, where proxy.ts's host-gating is bypassed.
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    docker build -f apps/web/Dockerfile -t "$IMAGE" \
      --build-arg NEXT_PUBLIC_KID_APP_URL=http://localhost:5173 \
      --build-arg NEXT_PUBLIC_PARENT_APP_URL=http://localhost:3000 \
      "$ROOT" >&2 || { echo "web image build failed" >&2; teardown; exit 1; }
  fi

  docker run -d --name "$WEB_CT" --network "$NET" -p "127.0.0.1:${PORT}:3000" \
    -e DATABASE_URL="$CT_DB_URL" -e DIRECT_URL="$CT_DB_URL" \
    -e EMAIL_PROVIDER="$EMAIL_PROVIDER_VALUE" \
    -e AUTH_JWT_SECRET=throwaway-sec-secret-not-a-real-key-000000 \
    -e NODE_ENV=production \
    "$IMAGE" >/dev/null || { echo "web container failed to start" >&2; teardown; exit 1; }

  if wait_for_health; then
    echo "BASE_URL=http://127.0.0.1:${PORT}"
    exit 0
  fi
  echo "target failed to become healthy" >&2
  teardown
  exit 1
}

case "${1:-}" in
  up) up;;
  down) teardown;;
  *) echo "usage: target.sh up|down" >&2; exit 2;;
esac
