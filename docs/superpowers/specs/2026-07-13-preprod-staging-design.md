# Pre-production (staging) environment — design

**Date:** 2026-07-13
**Branch:** `ops/preprod-staging`
**Status:** approved design → implementation plan next

## Problem
Prod deploys happen straight from a `v*` tag: CI builds images, SSHes to the VPS,
and `docker compose up -d` runs the `migrate` service (`prisma migrate deploy`) on
the **live** database. There is no environment between "merged to main" and
"applied to prod" — so migrations and runtime changes are only ever validated on a
throwaway local DB, never on a prod-shaped one. v2.9.0 shipped two migrations with
only a local dry-run standing in for staging; that gap is what this closes.

## Goal
A persistent **staging** environment that mirrors prod, auto-updates from
`main`-HEAD, and runs `migrate deploy` **before** prod does — so migration and
runtime regressions surface on staging — against the real prod curriculum plus
synthetic user fixtures — before a release tag is cut.

## Settled decisions
- **Hosting:** same Contabo VPS, a **second compose project** `gabee-staging`
  (shared Traefik + external `web` network; isolated DB volume + `internal` network
  via compose's per-project namespacing).
- **Trigger:** auto-deploy on **push to `main`**.
- **Data:** staging DB **persists**. No real user/PII data is ever copied. Content
  (curriculum, modules, sub-modes, questions, content plans, published bundle
  versions) is **copied from prod** on demand — those tables are PII-free, so no
  sanitization is needed. User tables are populated only by **synthetic fixtures**
  (fabricated parents/kids/devices) plus whatever testers create via real signup.
- **Access:** public URLs behind a **Traefik basic-auth** gate + `noindex`.
- **Domains:** `*.staging.gabee.app` zone (wildcard DNS already added).
- **Email:** staging uses the **real Mailgun** (no code bypass).

## Non-goals (v1)
- No backup sidecar on staging (nothing on staging is worth backing up).
- No cron-digest on staging (no real parent digests).
- No separate Sentry project (Sentry off on staging).
- **No restore of real prod user data, ever** — no sanitization machinery. (A
  content-tables-only copy carries no PII; if a future data-shaped migration truly
  needs real-user-row validation, restoring a sanitized prod dump is a documented
  *later* option, not built now.)
- No separate VPS.

## Architecture

### 1. Routing & isolation
Prod's Traefik router rule is already domain-parameterized:
`Host(${WEB_DOMAIN}) || Host(www.${WEB_DOMAIN}) || Host(parents.${WEB_DOMAIN}) || Host(admin.${WEB_DOMAIN}) || Host(api.${WEB_DOMAIN})`.
Using a `staging.gabee.app` **zone** lets staging reuse that rule verbatim with only
env changes:
- Prod: `WEB_DOMAIN=gabee.app`, `KID_DOMAIN=kids.gabee.app`.
- Staging: `WEB_DOMAIN=staging.gabee.app` (→ `parents.staging.gabee.app`,
  `admin.staging.gabee.app`, `api.staging.gabee.app`), `KID_DOMAIN=kids.staging.gabee.app`.

The one true collision is Traefik **router/middleware names** (hardcoded `gabee-web`,
`gabee-kid`), which must be globally unique. Parameterize them with a single
`${STACK}` var:
- `traefik.http.routers.${STACK:-gabee}-web.rule=…`
- `traefik.http.routers.${STACK:-gabee}-kid.rule=…`
- service refs and any middleware names use the same `${STACK}` prefix.

`STACK` defaults to `gabee`, so **prod output is byte-identical** to today. Staging
sets `STACK=gabee-staging`. Compose namespaces the `internal` network and the
`gabee-db` volume by project name, so staging Postgres is fully separate.

### 2. Config split (prod stays untouched)
- **`docker-compose.yml`** (base, shared): the ONLY change is `${STACK}`-prefixed
  router/middleware names. Everything else unchanged.
- **`docker-compose.staging.yml`** (override, staging-only): adds the basic-auth
  middleware + `noindex` header to the web + kid routers, and applies staging env
  overrides. It does NOT delete base services (an override can't) — instead the
  staging **deploy selectively starts only** `db migrate web kid`, so `backup` and
  `cron-digest` are defined-but-never-started. Sentry env left unset.
- **`.env.staging`** (gitignored, on the VPS only): staging domains, separate
  `POSTGRES_USER/PASSWORD/DB`, `STACK=gabee-staging`, `IMAGE_TAG=staging`,
  `WEB_BASIC_AUTH` (htpasswd bcrypt hash), real Mailgun creds, `AUTH_JWT_SECRET`
  (staging-specific). No R2 creds needed (no restore path). A tracked
  **`.env.staging.example`** documents every key (no secrets — see the
  secrets-never-in-example rule).

### 3. Basic-auth gate
`docker-compose.staging.yml` adds:
```
- traefik.http.middlewares.${STACK}-auth.basicauth.users=${WEB_BASIC_AUTH}
- traefik.http.routers.${STACK}-web.middlewares=${STACK}-auth
- traefik.http.routers.${STACK}-kid.middlewares=${STACK}-auth
- traefik.http.middlewares.${STACK}-noindex.headers.customresponseheaders.X-Robots-Tag=noindex, nofollow
```
`WEB_BASIC_AUTH` is a single shared `user:bcrypthash` generated with
`htpasswd -nbB tester '<pw>'`, stored only in `.env.staging`.

### 4. CI trigger & deploy — `.github/workflows/staging.yml`
Mirrors `release.yml` structure, but:
- **Trigger:** `on: push: branches: [main]` (+ `workflow_dispatch` for manual
  re-deploy). Path filter to skip docs-only pushes is optional (keep simple: build
  every main push).
- **Build:** `gabee-web` and `gabee-kid` tagged `:staging` **and** `:main-<sha>`
  (kid built with `VITE_APP_VERSION=staging-<sha>`). No backup/cron-digest image
  builds (staging doesn't run them; it reuses prod's `:latest` if ever needed).
- **Deploy step (SSH):** in a **separate checkout** `~/gabee-staging`:
  ```
  cd "$STAGING_DIR"
  git fetch origin && git checkout -f main && git reset --hard origin/main
  export IMAGE_TAG=staging STACK=gabee-staging
  docker compose -p gabee-staging --env-file .env.staging \
    -f docker-compose.yml -f docker-compose.staging.yml pull
  docker compose -p gabee-staging --env-file .env.staging \
    -f docker-compose.yml -f docker-compose.staging.yml up -d db migrate web kid
  ```
  `migrate` runs `prisma migrate deploy` against staging's persistent DB — the
  pre-prod migration check. Uses the same VPS SSH secrets as `release.yml`; adds a
  `VPS_STAGING_DIR` secret.

### 5. VPS layout
- `~/gabee` — prod checkout (unchanged), `.env.production`.
- `~/gabee-staging` — new clone/worktree of the repo tracking `main`, holds
  `.env.staging`. Kept separate so prod's `git checkout <tag>` and staging's
  `git checkout main` never fight.
- One-time bootstrap (documented in the plan): clone into `~/gabee-staging`, create
  `.env.staging`, `docker compose … up -d`, add DNS (already done), let Traefik mint
  certs.

### 6. Content copy from prod — `ops/staging/sync-curriculum.sh`
Manual/on-demand (run on the VPS), NOT part of deploy. Copies the **content tables
only** (all PII-free) from the prod DB container into the staging DB container,
on-box — no R2, no secrets in transit, no sanitization:

```
# on the VPS; prod + staging dbs are both local containers
docker compose -p gabee --env-file .env.production exec -T db \
  pg_dump -U "$PROD_PG_USER" -d "$PROD_PG_DB" --data-only --disable-triggers \
    -t curricula -t module_defs -t sub_modes -t questions \
    -t content_plans -t content_bundle_versions \
| docker compose -p gabee-staging --env-file .env.staging exec -T db \
    psql -U "$STG_PG_USER" -d "$STG_PG_DB" -v ON_ERROR_STOP=1
```

The script first `TRUNCATE … CASCADE`s those staging content tables (idempotent
re-sync), then loads. It pulls creds from the two env files (never printed). The
exact `@@map` table names are confirmed in the plan. Run it at bootstrap and again
whenever admin publishes new content.

### 7. Synthetic fixtures — `ops/staging/seed-fixtures.ts`
A staging-only script (guarded so it never runs against prod) that fabricates a
small, deterministic set of **invented** user data — **no real PII, nothing copied
from prod**:
- ~2 fake parents (`tester1@staging.gabee.app` / `tester2@…`, `email_confirmed_at`
  set, a shared known password so testers can log in immediately),
- ~3 child profiles across the parents (fabricated names, birth dates, avatars,
  gender, a little progress),
- 1 paired `DeviceLink` + `Device` so device/pairing screens have data.

This gives user-table migrations actual rows to run against and hands testers a
ready-to-browse account, with zero sanitization surface. Idempotent (upsert by
fixed ids). Testers can also self-serve via real signup (real Mailgun confirms).

### 8. DNS / TLS
`*.staging.gabee.app` wildcard A-record → VPS IP, **grey-cloud** (Cloudflare proxy
OFF — required for Traefik's LE TLS-ALPN-01 resolver, which the shared proxy
uses). Already added. Traefik issues per-host certs on first request.

## Testing / acceptance
- After bootstrap: `parents.staging.gabee.app` prompts basic-auth, then serves the
  login page over a valid LE cert; `kids.staging.gabee.app` loads the PWA.
- A push to `main` triggers `staging.yml`, images build, deploy succeeds, `migrate`
  exits 0, staging reflects the new commit (`VITE_APP_VERSION=staging-<sha>` visible
  in kid Settings→About).
- `sync-curriculum.sh` copies content: staging question/curriculum counts match prod
  (`SELECT count(*) FROM questions` equal on both), and **no user rows** were copied
  (`SELECT count(*) FROM parent_accounts` = only the synthetic fixtures).
- `seed-fixtures.ts` populates the fake accounts; `tester1@staging.gabee.app` can log
  in and browse its kids.
- Prod unaffected: `docker compose -p gabee config` diff on prod shows no change from
  the `${STACK}` default; prod routers still named `gabee-web`/`gabee-kid`.

## Rollout
1. Parameterize `docker-compose.yml` router names with `${STACK}` (+ verify prod
   `config` unchanged).
2. Add `docker-compose.staging.yml`, `.env.staging.example`, `ops/staging/*`.
3. Add `.github/workflows/staging.yml` + `VPS_STAGING_DIR` secret.
4. One-time VPS bootstrap of `~/gabee-staging` + `.env.staging` + basic-auth hash.
5. First auto-deploy from main; then run `sync-curriculum.sh` + `seed-fixtures.ts`
   once to populate content + fixtures.

## File inventory
- Modify: `docker-compose.yml` (router/middleware names → `${STACK}` prefix only).
- Create: `docker-compose.staging.yml`, `.env.staging.example`,
  `.github/workflows/staging.yml`, `ops/staging/sync-curriculum.sh`,
  `ops/staging/seed-fixtures.ts`, `docs/ops/staging.md` (runbook: bootstrap, content
  sync, fixtures, basic-auth cred rotation, teardown).
