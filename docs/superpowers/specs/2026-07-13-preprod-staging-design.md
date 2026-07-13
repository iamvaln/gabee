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
runtime regressions surface on staging, against realistic (sanitized) data, before
a release tag is cut.

## Settled decisions
- **Hosting:** same Contabo VPS, a **second compose project** `gabee-staging`
  (shared Traefik + external `web` network; isolated DB volume + `internal` network
  via compose's per-project namespacing).
- **Trigger:** auto-deploy on **push to `main`**.
- **Data:** staging DB **persists**; refreshed **on demand** by restoring the latest
  R2 prod dump and running a **sanitization** pass (never on every deploy).
- **Access:** public URLs behind a **Traefik basic-auth** gate + `noindex`.
- **Domains:** `*.staging.gabee.app` zone (wildcard DNS already added).
- **Email:** staging uses the **real Mailgun** (no code bypass).

## Non-goals (v1)
- No backup sidecar on staging (data is disposable/restorable).
- No cron-digest on staging (no real parent digests).
- No separate Sentry project (Sentry off on staging).
- No automatic data-refresh on every deploy.
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
  staging **deploy selectively starts only** `db migrate web kid`, so `cron-digest`
  is defined-but-never-started, and `backup` stays available for **run-only** use by
  the refresh script (`docker compose … run --rm backup …`), never `up`ed. Sentry
  env left unset.
- **`.env.staging`** (gitignored, on the VPS only): staging domains, separate
  `POSTGRES_USER/PASSWORD/DB`, `STACK=gabee-staging`, `IMAGE_TAG=staging`,
  `WEB_BASIC_AUTH` (htpasswd bcrypt hash), real Mailgun creds, `AUTH_JWT_SECRET`
  (staging-specific), R2 creds (for restore only). A tracked
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

### 6. Data lifecycle — `ops/staging/refresh-data.sh`
Manual/periodic (run on the VPS), NOT part of deploy. Runs in the **staging compose
context** so PGHOST/network/creds resolve to staging:
1. `docker compose -p gabee-staging --env-file .env.staging -f docker-compose.yml
   -f docker-compose.staging.yml run --rm backup restore latest` — the `gabee-backup`
   image pulls prod's newest `backups/*.sql.gz` from R2 and loads it into the
   **staging** `db` (the backup image already bundles `aws-cli` + `postgresql16-client`;
   `restore` drop+recreates and `psql`-loads). It reads R2 creds + `PG*` from
   `.env.staging`, so it targets staging, not prod.
2. Run `prisma migrate deploy` (via the `migrate` service) to bring the restored
   (prod-versioned) DB up to `main`-HEAD migrations.
3. Run **`ops/staging/sanitize.sql`** (see §7).
Because staging persists between deploys, day-to-day main pushes only run *pending*
migrations against this prod-mirrored data — exactly what the prod deploy will do.

### 7. Sanitization — `ops/staging/sanitize.sql`
Runs after every restore. Scrubs PII to **non-deliverable** values so the real
Mailgun can never reach a real person:
- `parent_accounts`: `email → 'parent+'||id||'@staging.invalid'`, `name → 'Parent '||left(id::text,8)`, `phone → NULL`, `password_hash → '<known test bcrypt>'` (so testers can log into restored accounts with one shared password). Keep `email_confirmed_at` as-is (restored accounts stay confirmed).
- `child_profiles`: `name → 'Kid '||left(id::text,8)`. **Keep `birth_date`** (age logic must stay realistic). Keep `gender`, avatar fields, progress.
- `messages`: body/content → `'[redacted]'`.
- `device_ip_sightings` / device metadata: `ip → NULL`/`'0.0.0.0'`, UA → `'redacted'`.
- `auth_event_logs`: `ip → NULL`, UA → `'redacted'`.
- Truncate any push/notification tokens and password-reset tokens.
The script is idempotent and lists exactly which columns it touches; new PII columns
must be added here (a checklist note in the plan).

Fresh signups on staging use **real** emails → real Mailgun confirmation, so email
flows are still testable end-to-end; restored accounts are for browsing existing
data with the shared test password.

### 8. DNS / TLS
`*.staging.gabee.app` wildcard A-record → VPS IP, **grey-cloud** (Cloudflare proxy
OFF — required for Traefik's LE HTTP-01 resolver). Already added. Traefik issues
per-host certs on first request.

## Testing / acceptance
- After bootstrap: `parents.staging.gabee.app` prompts basic-auth, then serves the
  login page over a valid LE cert; `kids.staging.gabee.app` loads the PWA.
- A push to `main` triggers `staging.yml`, images build, deploy succeeds, `migrate`
  exits 0, staging reflects the new commit (`VITE_APP_VERSION=staging-<sha>` visible
  in kid Settings→About).
- `refresh-data.sh` restores + sanitizes: spot-check that no `@`-real-domain emails
  and no real names remain (`SELECT count(*) … WHERE email NOT LIKE '%@staging.invalid'`).
- Prod unaffected: `docker compose -p gabee config` diff on prod shows no change from
  the `${STACK}` default; prod routers still named `gabee-web`/`gabee-kid`.

## Rollout
1. Parameterize `docker-compose.yml` router names with `${STACK}` (+ verify prod
   `config` unchanged).
2. Add `docker-compose.staging.yml`, `.env.staging.example`, `ops/staging/*`.
3. Add `.github/workflows/staging.yml` + `VPS_STAGING_DIR` secret.
4. One-time VPS bootstrap of `~/gabee-staging` + `.env.staging` + basic-auth hash.
5. First auto-deploy from main; then run `refresh-data.sh` once for realistic data.

## File inventory
- Modify: `docker-compose.yml` (router/middleware names → `${STACK}` prefix only).
- Create: `docker-compose.staging.yml`, `.env.staging.example`,
  `.github/workflows/staging.yml`, `ops/staging/refresh-data.sh`,
  `ops/staging/sanitize.sql`, `docs/ops/staging.md` (runbook: bootstrap, refresh,
  basic-auth cred rotation, teardown).
