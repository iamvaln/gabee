#!/usr/bin/env bash
# Copy the PII-FREE content tables from the prod DB container into the staging DB
# container, on-box. No R2, no secrets in transit, no sanitization. Idempotent.
# Run on the VPS from the repo root (must contain both .env.production and, in the
# staging checkout, .env.staging). Usage:
#   PROD_DIR=~/gabee STAGING_DIR=~/gabee-staging ops/staging/sync-curriculum.sh
set -euo pipefail

PROD_DIR="${PROD_DIR:-$HOME/gabee}"
STAGING_DIR="${STAGING_DIR:-$HOME/gabee-staging}"
TABLES=(curricula modules sub_modes questions content_plans content_bundle_versions)

prod() { docker compose -p gabee --env-file "$PROD_DIR/.env.production" -f "$PROD_DIR/docker-compose.yml" "$@"; }
stg()  { docker compose -p gabee-staging --env-file "$STAGING_DIR/.env.staging" \
           -f "$STAGING_DIR/docker-compose.yml" -f "$STAGING_DIR/docker-compose.staging.yml" "$@"; }

# Creds are read from the env files by compose; we reference the values via the
# containers' own env so nothing is printed here.
echo "[sync-curriculum] truncating staging content tables"
stg exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "TRUNCATE '"$(IFS=,; echo "${TABLES[*]}")"' RESTART IDENTITY CASCADE;"'

echo "[sync-curriculum] dumping prod content → loading into staging"
TARGS=""; for t in "${TABLES[@]}"; do TARGS="$TARGS -t $t"; done
prod exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --disable-triggers '"$TARGS"'' \
  | stg exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'

echo "[sync-curriculum] done. staging question count:"
stg exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM questions;"'
