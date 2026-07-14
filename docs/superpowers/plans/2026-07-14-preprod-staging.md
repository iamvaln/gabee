# Pre-production (staging) environment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a same-box `gabee-staging` compose project that auto-deploys `main`-HEAD, runs `prisma migrate deploy` before prod does, and serves `*.staging.gabee.app` behind basic-auth — with content copied from prod (PII-free) and synthetic user fixtures.

**Architecture:** Reuse the existing `docker-compose.yml` for both prod and staging by parameterizing the Traefik router names with `${STACK}` (defaults to `gabee`, so prod is unchanged). A `docker-compose.staging.yml` override adds basic-auth + noindex. A new `staging.yml` GitHub workflow builds `:staging` images on push to `main` and SSH-deploys to a separate `~/gabee-staging` checkout. Content is synced from the prod DB container to the staging DB container on-box; user tables get deterministic synthetic fixtures.

**Tech Stack:** Docker Compose v2, Traefik (TLS-ALPN LE), GitHub Actions, Prisma 7 + Postgres 16, tsx.

## Global Constraints

- Work on branch `ops/preprod-staging` (already checked out in `/Users/valentine/dev/gabee-preprod`). Do NOT work on `main` or the audio branch.
- **Prod compose output MUST stay byte-identical**: `${STACK}` defaults to `gabee`, so with `STACK` unset the rendered config is exactly today's. Every compose task verifies this.
- Domains: prod `WEB_DOMAIN=gabee.app` / `KID_DOMAIN=kids.gabee.app`; staging `WEB_DOMAIN=staging.gabee.app` / `KID_DOMAIN=kids.staging.gabee.app`. Router rule reused verbatim.
- Compose project: prod `gabee` (from `name:`), staging `gabee-staging` (via `-p`). Volumes/networks isolate per project automatically.
- Content tables (PII-free, copied from prod): `curricula`, `modules`, `sub_modes`, `questions`, `content_plans`, `content_bundle_versions`.
- **No real prod user/PII data on staging, ever.** No sanitization machinery.
- Staging email uses **real Mailgun**. Sentry **off** on staging. No backup/cron-digest services started on staging.
- Secrets NEVER in tracked files: `.env.staging.example` holds placeholders only (see the secrets-in-env-example rule). Real values live in `.env.staging` on the VPS.
- No `Co-Authored-By` / Claude attribution trailer in any commit.
- Node@20 keg-only: if `pnpm`/`tsx`/`psql` aren't found, prepend `/opt/homebrew/opt/node@20/bin` and `/opt/homebrew/opt/postgresql@14/bin` to PATH.

---

### Task 1: Parameterize compose router/service names with `${STACK}`

**Files:**
- Modify: `docker-compose.yml` (Traefik label names only)

**Interfaces:**
- Produces: router/service/middleware names derive from `${STACK:-gabee}` so a second project can coexist in one Traefik. Prod (STACK unset) renders `gabee-web` / `gabee-kid` exactly as before.

- [ ] **Step 1: Edit the `web` service Traefik labels**

In `docker-compose.yml`, replace the four `gabee-web` label keys so the router/service name is `${STACK:-gabee}-web`:

```yaml
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - traefik.http.routers.${STACK:-gabee}-web.rule=Host(`${WEB_DOMAIN}`) || Host(`www.${WEB_DOMAIN}`) || Host(`parents.${WEB_DOMAIN}`) || Host(`admin.${WEB_DOMAIN}`) || Host(`api.${WEB_DOMAIN}`)
      - traefik.http.routers.${STACK:-gabee}-web.entrypoints=websecure
      - traefik.http.routers.${STACK:-gabee}-web.tls.certresolver=le
      - traefik.http.services.${STACK:-gabee}-web.loadbalancer.server.port=3000
```

- [ ] **Step 2: Edit the `kid` service Traefik labels**

```yaml
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - traefik.http.routers.${STACK:-gabee}-kid.rule=Host(`${KID_DOMAIN}`)
      - traefik.http.routers.${STACK:-gabee}-kid.entrypoints=websecure
      - traefik.http.routers.${STACK:-gabee}-kid.tls.certresolver=le
      - traefik.http.services.${STACK:-gabee}-kid.loadbalancer.server.port=80
```

- [ ] **Step 3: Verify prod render is unchanged (STACK unset → `gabee-web`/`gabee-kid`)**

Run (dummy env just to satisfy interpolation; `STACK` deliberately unset):
```bash
cd /Users/valentine/dev/gabee-preprod
WEB_DOMAIN=gabee.app KID_DOMAIN=kids.gabee.app POSTGRES_USER=x POSTGRES_PASSWORD=x POSTGRES_DB=x \
  docker compose -f docker-compose.yml config 2>/dev/null | grep -E 'routers\.[a-z-]+-(web|kid)\.rule'
```
Expected: names are `gabee-web` and `gabee-kid` (byte-identical to today).

- [ ] **Step 4: Verify staging render uses the staging names**

```bash
STACK=gabee-staging WEB_DOMAIN=staging.gabee.app KID_DOMAIN=kids.staging.gabee.app \
  POSTGRES_USER=x POSTGRES_PASSWORD=x POSTGRES_DB=x \
  docker compose -f docker-compose.yml config 2>/dev/null | grep -E 'routers\.gabee-staging-(web|kid)\.rule'
```
Expected: `gabee-staging-web` and `gabee-staging-kid` routers with `parents.staging.gabee.app` etc. in the rule.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(ops): parameterize compose Traefik router names with \${STACK}"
```

---

### Task 2: Staging compose override (basic-auth + noindex)

**Files:**
- Create: `docker-compose.staging.yml`

**Interfaces:**
- Consumes: `${STACK}` (router names from Task 1), `${WEB_BASIC_AUTH}` (htpasswd user:hash from `.env.staging`).
- Produces: a `-f` override that attaches a basic-auth + noindex middleware to the staging web + kid routers. Merges additively with the base labels (compose merges `labels` by key).

- [ ] **Step 1: Create `docker-compose.staging.yml`**

```yaml
# Staging-only overlay. Use WITH the base file:
#   docker compose -p gabee-staging --env-file .env.staging \
#     -f docker-compose.yml -f docker-compose.staging.yml up -d db migrate web kid
#
# Adds a single shared basic-auth gate + noindex to the staging routers. The
# base services `backup` and `cron-digest` are simply never started on staging.
services:
  web:
    labels:
      - traefik.http.middlewares.${STACK}-auth.basicauth.users=${WEB_BASIC_AUTH}
      - traefik.http.middlewares.${STACK}-noindex.headers.customresponseheaders.X-Robots-Tag=noindex, nofollow
      - traefik.http.routers.${STACK}-web.middlewares=${STACK}-auth,${STACK}-noindex
  kid:
    labels:
      - traefik.http.routers.${STACK}-kid.middlewares=${STACK}-auth,${STACK}-noindex
```

- [ ] **Step 2: Verify the merged staging config carries the middleware**

```bash
cd /Users/valentine/dev/gabee-preprod
STACK=gabee-staging WEB_DOMAIN=staging.gabee.app KID_DOMAIN=kids.staging.gabee.app \
  WEB_BASIC_AUTH='tester:$$2y$$05$$abc' POSTGRES_USER=x POSTGRES_PASSWORD=x POSTGRES_DB=x \
  docker compose -f docker-compose.yml -f docker-compose.staging.yml config 2>/dev/null \
  | grep -E 'gabee-staging-(auth|noindex|web\.middlewares|kid\.middlewares)'
```
Expected: shows the `gabee-staging-auth` basicauth middleware, `gabee-staging-noindex` header middleware, and both routers referencing `gabee-staging-auth,gabee-staging-noindex`.

- [ ] **Step 3: Verify base file alone (prod) has NO middleware (unaffected)**

```bash
WEB_DOMAIN=gabee.app KID_DOMAIN=kids.gabee.app POSTGRES_USER=x POSTGRES_PASSWORD=x POSTGRES_DB=x \
  docker compose -f docker-compose.yml config 2>/dev/null | grep -c 'middlewares' || true
```
Expected: `0` (prod routers have no middleware).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.staging.yml
git commit -m "feat(ops): staging compose overlay — basic-auth + noindex gate"
```

---

### Task 3: `.env.staging.example` (tracked template, placeholders only)

**Files:**
- Create: `.env.staging.example`

**Interfaces:**
- Produces: the documented key set for `.env.staging` (the real file lives only on the VPS). Mirrors `.env.production.example` minus R2/Sentry/cron, plus `STACK`, `IMAGE_TAG`, `WEB_BASIC_AUTH`.

- [ ] **Step 1: Create `.env.staging.example`**

```bash
# ─────────────────────────────────────────────────────────────────────────────
# Gabee — STAGING env. Copy to `.env.staging` on the VPS and fill in.
# NEVER commit the filled file. Generate secrets with:  openssl rand -hex 32
# ─────────────────────────────────────────────────────────────────────────────

# ── Compose project namespacing (staging routers/volumes/networks) ──
STACK=gabee-staging
IMAGE_TAG=staging

# ── Domains (Traefik routing; *.staging.gabee.app zone) ──
WEB_DOMAIN=staging.gabee.app
KID_DOMAIN=kids.staging.gabee.app

# ── Basic-auth gate (single shared tester credential) ──
# Generate:  htpasswd -nbB tester 'CHOOSE_A_PASSWORD'
# Then DOUBLE every '$' to '$$' so compose does not interpolate the bcrypt hash:
#   htpasswd -nbB tester 'pw' | sed 's/\$/\$\$/g'
WEB_BASIC_AUTH=tester:$$2y$$05$$CHANGE_ME_doubled_dollar_bcrypt_hash

# ── PostgreSQL (staging `db` service — SEPARATE from prod) ──
POSTGRES_USER=gabee_staging
POSTGRES_PASSWORD=CHANGE_ME_strong_password
POSTGRES_DB=gabee_staging
DATABASE_URL=postgresql://gabee_staging:CHANGE_ME_strong_password@db:5432/gabee_staging?schema=public
DIRECT_URL=postgresql://gabee_staging:CHANGE_ME_strong_password@db:5432/gabee_staging?schema=public

# ── Auth secrets (staging-specific; different from prod) ──
AUTH_JWT_SECRET=CHANGE_ME_openssl_rand_hex_32
COPARENT_INVITE_SECRET=CHANGE_ME_openssl_rand_hex_32

# ── Cross-origin + public URLs (staging hosts) ──
KID_APP_ORIGIN=https://kids.staging.gabee.app
NEXT_PUBLIC_KID_APP_URL=https://kids.staging.gabee.app
NEXT_PUBLIC_PARENT_APP_URL=https://parents.staging.gabee.app
VITE_API_BASE_URL=https://api.staging.gabee.app
PARENT_APP_URL=https://parents.staging.gabee.app

# ── Session-cookie scopes (staging zone) ──
COOKIE_DOMAIN_PARENT=.staging.gabee.app
COOKIE_DOMAIN_ADMIN=admin.staging.gabee.app

# ── LLM (optional on staging; leave unset to disable content generation) ──
ANTHROPIC_API_KEY=

# ── Email — REAL Mailgun (staging sends real confirmation emails) ──
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=CHANGE_ME
MAILGUN_DOMAIN=CHANGE_ME
MAILGUN_FROM=Gabee Staging <no-reply@staging.gabee.app>
MAILGUN_REGION=eu
MAILGUN_BASE_URL=https://api.eu.mailgun.net/v3

# ── Not used on staging ──
# No R2 (no backups), no Sentry (off), no CRON_SECRET (no cron-digest started).

NODE_ENV=production
```

- [ ] **Step 2: Verify no real secret leaked (all values are placeholders)**

```bash
cd /Users/valentine/dev/gabee-preprod
grep -nE 'sk-ant-[A-Za-z0-9]|key-[0-9a-f]{20}|@0[a-z0-9]+\.ingest' .env.staging.example || echo "clean — placeholders only"
```
Expected: `clean — placeholders only`.

- [ ] **Step 3: Commit**

```bash
git add .env.staging.example
git commit -m "docs(ops): .env.staging.example template"
```

---

### Task 4: Content-copy script `ops/staging/sync-curriculum.sh`

**Files:**
- Create: `ops/staging/sync-curriculum.sh` (executable)

**Interfaces:**
- Consumes: two on-box compose projects (`gabee`, `gabee-staging`) + their env files.
- Produces: staging content tables (re)loaded from prod. PII-free; idempotent (truncate+load).

- [ ] **Step 1: Create `ops/staging/sync-curriculum.sh`**

```bash
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
```

- [ ] **Step 2: Make it executable + shellcheck**

```bash
cd /Users/valentine/dev/gabee-preprod
chmod +x ops/staging/sync-curriculum.sh
command -v shellcheck >/dev/null && shellcheck ops/staging/sync-curriculum.sh || bash -n ops/staging/sync-curriculum.sh
```
Expected: no syntax errors (shellcheck may warn on the dynamic `$TARGS` word-splitting, which is intentional — acceptable).

- [ ] **Step 3: Commit**

```bash
git add ops/staging/sync-curriculum.sh
git commit -m "feat(ops): sync-curriculum — copy PII-free content prod→staging on-box"
```

---

### Task 5: Synthetic fixtures `packages/db/prisma/seed-fixtures.ts`

**Files:**
- Create: `packages/db/prisma/seed-fixtures.ts`

**Interfaces:**
- Consumes: `createPrismaClient` from `../src/client` (same as `seed.ts`), `Gender` enum from the generated client.
- Produces: deterministic fabricated users runnable via `pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts`. Guarded: refuses to run unless `STAGING_FIXTURES=1` (so it can never populate prod by accident).

- [ ] **Step 1: Write the fixtures script**

```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/client';

// Fabricated, deterministic staging fixtures. NO real PII, nothing copied from
// prod. Guarded so it can never run against a non-staging DB by accident.
// Run: STAGING_FIXTURES=1 pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts
if (process.env.STAGING_FIXTURES !== '1') {
  console.error('Refusing to run: set STAGING_FIXTURES=1 (staging only).');
  process.exit(1);
}

// Fixed ids → idempotent upserts (safe to re-run).
const P1 = '00000000-0000-4000-9000-000000000001';
const P2 = '00000000-0000-4000-9000-000000000002';
const KIDS = [
  { id: '00000000-0000-4000-9000-0000000000a1', parentId: P1, name: 'Ava',   birthDate: '2018-04-12', gender: 'girl' as const },
  { id: '00000000-0000-4000-9000-0000000000a2', parentId: P1, name: 'Noah',  birthDate: '2016-09-30', gender: 'boy'  as const },
  { id: '00000000-0000-4000-9000-0000000000a3', parentId: P2, name: 'Mia',   birthDate: '2019-01-05', gender: 'girl' as const },
];
// bcrypt for the shared staging password "staging-pass" (documented in the runbook).
// Generated with: node -e "import('bcryptjs').then(b=>b.hash('staging-pass',10).then(console.log))"
const SHARED_HASH = '$2b$10$Q8Yb0m5m3m9k1oQm8xq3XeJ4o2fO2Jv1s0m9k1oQm8xq3XeJ4o2fO';

async function main() {
  const prisma = createPrismaClient();
  try {
    for (const [id, email] of [[P1, 'tester1@staging.gabee.app'], [P2, 'tester2@staging.gabee.app']] as const) {
      await prisma.parentAccount.upsert({
        where: { id },
        update: { email },
        create: {
          id, email,
          displayNameForKids: 'Tester',
          emailConfirmedAt: new Date(),
          credentials: { create: { id: randomUUID(), hash: SHARED_HASH } },
        },
      });
    }
    for (const k of KIDS) {
      await prisma.childProfile.upsert({
        where: { id: k.id },
        update: { name: k.name },
        create: {
          id: k.id, parentId: k.parentId, name: k.name,
          birthDate: new Date(k.birthDate), gender: k.gender,
        },
      });
    }
    const parents = await prisma.parentAccount.count();
    const kids = await prisma.childProfile.count();
    console.log(`fixtures OK — parents=${parents} kids=${kids}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Note: verify the exact relation name for credentials (`ParentCredential`) and required `ChildProfile` fields against `schema.prisma` while implementing; adjust field names to match (e.g. the credential back-relation, any non-nullable columns without defaults). The upsert shape above is the intent.

- [ ] **Step 2: Write the failing check (fresh throwaway DB)**

```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/opt/postgresql@14/bin:$PATH"
psql -h localhost -U valentine -d postgres -c "DROP DATABASE IF EXISTS gabee_fix_test;" -c "CREATE DATABASE gabee_fix_test;"
cd /Users/valentine/dev/gabee-preprod
export DATABASE_URL="postgresql://valentine@localhost:5432/gabee_fix_test?schema=public"
export DIRECT_URL="$DATABASE_URL"
pnpm --filter @gabee/db exec prisma migrate deploy >/dev/null
pnpm --filter @gabee/db exec prisma generate >/dev/null
STAGING_FIXTURES=1 pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts
```
Expected first pass: it runs; if any field/relation name is wrong, fix per the schema and re-run until it prints `fixtures OK — parents=2 kids=3`.

- [ ] **Step 3: Verify the guard + row counts, then drop the test DB**

```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/opt/postgresql@14/bin:$PATH"
cd /Users/valentine/dev/gabee-preprod
# guard: without the flag it must refuse
DATABASE_URL="postgresql://valentine@localhost:5432/gabee_fix_test?schema=public" DIRECT_URL="$DATABASE_URL" \
  pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts; test $? -ne 0 && echo "guard OK (refused)"
# idempotency: run twice → still 2 parents / 3 kids
psql -h localhost -U valentine -d gabee_fix_test -tAc "SELECT (SELECT count(*) FROM parent_accounts)||'/'||(SELECT count(*) FROM child_profiles);"
psql -h localhost -U valentine -d postgres -c "DROP DATABASE gabee_fix_test;"
```
Expected: `guard OK (refused)` and `2/3`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/seed-fixtures.ts
git commit -m "feat(ops): staging synthetic fixtures (guarded, deterministic, no PII)"
```

---

### Task 6: Staging deploy workflow `.github/workflows/staging.yml`

**Files:**
- Create: `.github/workflows/staging.yml`

**Interfaces:**
- Consumes: same VPS SSH secrets as `release.yml` (`VPS_HOST/USER/SSH_KEY/PORT`) + new `VPS_STAGING_DIR`. GHCR via `GITHUB_TOKEN`.
- Produces: on push to `main` (or manual dispatch), builds `gabee-web`/`gabee-kid` `:staging` (+ `:staging-<sha>`) and deploys the `gabee-staging` project on the VPS. `migrate deploy` runs on staging.

- [ ] **Step 1: Create `.github/workflows/staging.yml`**

```yaml
name: Staging

# Auto-deploy main-HEAD to the pre-prod stack; also runnable on demand.
on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io/iamvaln
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'

jobs:
  build-web:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - name: Build & push web (staging)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          build-args: |
            NEXT_PUBLIC_KID_APP_URL=https://kids.staging.gabee.app
            NEXT_PUBLIC_PARENT_APP_URL=https://parents.staging.gabee.app
          tags: |
            ${{ env.REGISTRY }}/gabee-web:staging
            ${{ env.REGISTRY }}/gabee-web:staging-${{ github.sha }}
          cache-from: type=gha,scope=web
          cache-to: type=gha,scope=web,mode=max

  build-kid:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - name: Build & push kid (staging)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/kid/Dockerfile
          push: true
          build-args: |
            VITE_API_BASE_URL=https://api.staging.gabee.app
            VITE_APP_VERSION=staging-${{ github.sha }}
          tags: |
            ${{ env.REGISTRY }}/gabee-kid:staging
            ${{ env.REGISTRY }}/gabee-kid:staging-${{ github.sha }}
          cache-from: type=gha,scope=kid
          cache-to: type=gha,scope=kid,mode=max

  deploy:
    needs: [build-web, build-kid]
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT || 22 }}
          envs: GHCR_USER,GHCR_TOKEN,STAGING_DIR
          script: |
            set -euo pipefail
            cd "${STAGING_DIR:-$HOME/gabee-staging}"
            echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
            export IMAGE_TAG=staging STACK=gabee-staging
            git fetch origin
            git checkout -f main
            git reset --hard origin/main
            COMPOSE="docker compose -p gabee-staging --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml"
            # Only staging services exist as :staging images (no backup/cron-digest builds).
            $COMPOSE pull web kid
            $COMPOSE up -d db migrate web kid
            docker logout ghcr.io
            docker image prune -f
        env:
          GHCR_USER: ${{ github.actor }}
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          STAGING_DIR: ${{ secrets.VPS_STAGING_DIR }}
```

- [ ] **Step 2: Validate the workflow YAML**

```bash
cd /Users/valentine/dev/gabee-preprod
command -v actionlint >/dev/null && actionlint .github/workflows/staging.yml \
  || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/staging.yml')); print('yaml OK')"
```
Expected: `yaml OK` (or actionlint clean).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/staging.yml
git commit -m "feat(ops): staging deploy workflow (build :staging + SSH deploy on push to main)"
```

---

### Task 7: Ops runbook `docs/ops/staging.md`

**Files:**
- Create: `docs/ops/staging.md`

**Interfaces:**
- Produces: the human runbook for the parts that are manual-on-the-VPS (one-time bootstrap, content sync, fixtures, basic-auth rotation, teardown). No code depends on it.

- [ ] **Step 1: Write the runbook**

Create `docs/ops/staging.md` covering, concretely:
- **Prereqs (once):** GitHub repo secrets `VPS_STAGING_DIR` (e.g. `/home/deploy/gabee-staging`); GitHub `staging` environment; DNS `*.staging.gabee.app` → VPS IP, **grey-cloud** (Cloudflare proxy OFF — required for Traefik's TLS-ALPN LE resolver).
- **Bootstrap (once, on the VPS):**
  ```bash
  git clone <repo> ~/gabee-staging && cd ~/gabee-staging && git checkout main
  cp .env.staging.example .env.staging   # then fill in
  # basic-auth cred (note the $$ doubling for compose):
  htpasswd -nbB tester 'PICK_A_PW' | sed 's/\$/\$\$/g'   # paste into WEB_BASIC_AUTH
  export STACK=gabee-staging IMAGE_TAG=staging
  docker compose -p gabee-staging --env-file .env.staging \
    -f docker-compose.yml -f docker-compose.staging.yml up -d db migrate web kid
  ```
- **Populate data:** `PROD_DIR=~/gabee STAGING_DIR=~/gabee-staging ops/staging/sync-curriculum.sh`, then
  `STACK=gabee-staging IMAGE_TAG=staging docker compose -p gabee-staging --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml run --rm -e STAGING_FIXTURES=1 migrate pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts` (fixtures run inside the web/migrate image, which has the DB layer).
- **Shared tester login:** `tester1@staging.gabee.app` / password `staging-pass` (matches the `SHARED_HASH` in seed-fixtures.ts — regenerate both together if changed).
- **Basic-auth rotation:** regenerate `WEB_BASIC_AUTH`, `up -d web kid`.
- **Teardown:** `docker compose -p gabee-staging ... down -v` (drops the staging volume).
- **Ongoing:** every push to `main` auto-deploys (workflow `Staging`) and runs `migrate deploy` on staging — check it's green before cutting a `v*` release tag.

- [ ] **Step 2: Commit**

```bash
git add docs/ops/staging.md
git commit -m "docs(ops): staging runbook (bootstrap, content sync, fixtures, rotation)"
```

---

## Self-Review

**Spec coverage:**
- §1 routing/isolation → Task 1 (`${STACK}` router names) + isolation is inherent to `-p gabee-staging`. ✅
- §2 config split → Task 1 (base) + Task 2 (override) + Task 3 (.env.staging.example). ✅
- §3 basic-auth → Task 2. ✅
- §4 CI trigger & deploy → Task 6. ✅
- §5 VPS layout → Task 7 runbook (bootstrap of `~/gabee-staging`). ✅
- §6 content copy → Task 4. ✅
- §7 synthetic fixtures → Task 5. ✅
- §8 DNS/TLS → Task 7 runbook (grey-cloud, TLS-ALPN). ✅

**Placeholder scan:** `.env.staging.example` values are intentional placeholders (CHANGE_ME); no real secrets. The `SHARED_HASH` in seed-fixtures is a fabricated staging-only test hash (documented). No TODO/TBD.

**Type consistency:** `${STACK}` router names match between Task 1 (base) and Task 2 (override) and the Task 6 deploy (`STACK=gabee-staging`). Content table list is identical in Task 4 and the Global Constraints. `IMAGE_TAG=staging` matches between Task 6 build tags and the deploy pull.

**Known follow-ups the implementer must resolve against live schema (flagged inline):** exact `ParentCredential` relation name + any required non-null `ChildProfile`/`ParentAccount` columns in Task 5 (the upsert shape is the intent; field names verified during Step 2's run-until-green). The `SHARED_HASH` must be a real bcrypt of the documented password — regenerate it for real during Task 5 (the placeholder above is illustrative).

## Manual (not coded) — final bring-up
The one-time VPS bootstrap, DNS grey-cloud confirmation, GitHub `staging` environment + `VPS_STAGING_DIR` secret, and the first `sync-curriculum.sh` + fixtures run are **operator steps** (documented in Task 7's runbook), performed after the code lands. They need SSH + real secrets on the box and are intentionally outside the coded tasks.
