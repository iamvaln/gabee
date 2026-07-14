# Staging environment — operator runbook

A second, isolated compose stack (`-p gabee-staging`) on the same VPS as
production, behind the same shared Traefik proxy. It reuses `docker-compose.yml`
plus a `docker-compose.staging.yml` overlay that adds a shared basic-auth gate
and a `noindex` header. Content is copied from prod (curriculum tables only,
no PII); accounts are fabricated, deterministic fixtures — never real user data.

This file is the runbook for everything that's manual-on-the-VPS: one-time
bootstrap, content sync, fixtures, basic-auth rotation, and teardown. The
compose files, env template, sync script, and fixtures script are all checked
into the repo — this doc just tells you how to actually run them.

## 1. Prereqs (once)

- **GitHub repo secrets**: `VPS_STAGING_DIR` (e.g. `/home/deploy/gabee-staging`
  — the checkout path on the VPS the deploy workflow `cd`s into), plus the
  existing `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (shared with the prod deploy).
- **GitHub `staging` environment**: create it under repo Settings → Environments
  so the `deploy` job in `.github/workflows/staging.yml` (which declares
  `environment: staging`) can read the secrets above.
- **DNS**: `*.staging.gabee.app` → the VPS IP, **grey-cloud** (Cloudflare proxy
  **OFF**). Traefik's TLS-ALPN-01 Let's Encrypt resolver needs to terminate TLS
  directly — an orange-clouded (proxied) record breaks the ALPN challenge.
  This covers `staging.gabee.app`, `www.`, `parents.`, `admin.`, `api.`, and
  `kids.staging.gabee.app` (the web service answers all of the `WEB_DOMAIN`
  subdomains via host-based routing; `kid` is a separate `KID_DOMAIN`).

## 2. Bootstrap (once, on the VPS)

```bash
git clone <repo-url> ~/gabee-staging && cd ~/gabee-staging && git checkout main

cp .env.staging.example .env.staging   # then fill in the CHANGE_ME values
```

Fill in `.env.staging`: `POSTGRES_PASSWORD`/`DATABASE_URL`/`DIRECT_URL`
(staging-only Postgres creds, separate from prod), `AUTH_JWT_SECRET` and
`COPARENT_INVITE_SECRET` (`openssl rand -hex 32` each, staging-specific —
**do not reuse prod's**), and the Mailgun creds (staging sends real
confirmation emails via the real Mailgun account, so use real values).
`ANTHROPIC_API_KEY` can stay empty (disables content generation on staging).

Generate the basic-auth credential. **Note the `$$` doubling** — compose
interpolates `$` in `.env` files, so a raw bcrypt hash (which is full of `$`)
gets corrupted unless every `$` is escaped to `$$`:

```bash
htpasswd -nbB tester 'PICK_A_PASSWORD' | sed 's/\$/\$\$/g'
# paste the output as WEB_BASIC_AUTH=... in .env.staging
```

First bring-up:

```bash
export STACK=gabee-staging IMAGE_TAG=staging
docker compose -p gabee-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml up -d db migrate web kid
```

Only `db`, `migrate`, `web`, `kid` are started — `backup` and `cron-digest`
from the base compose file are prod-only and are simply never named here.
`migrate` runs `prisma migrate deploy` once and exits; `web`/`kid` wait on it
via `depends_on`. Confirm with `docker compose -p gabee-staging ps` and
`docker compose -p gabee-staging logs -f web`.

## 3. Populate data

**Content (curriculum tables, copied from prod, no PII):**

```bash
PROD_DIR=~/gabee STAGING_DIR=~/gabee-staging ops/staging/sync-curriculum.sh
```

Run from the staging checkout root; it needs both `~/gabee/.env.production`
and `~/gabee-staging/.env.staging` to exist. It truncates
`curricula, modules, sub_modes, questions, content_plans,
content_bundle_versions` in staging, then pipes a `pg_dump --data-only` of
those same tables from the prod `db` container straight into the staging `db`
container over stdin (no intermediate file, nothing touches disk). Re-run any
time prod content changes — it's idempotent (truncate + reload).

**Fixtures (fabricated parent/kid accounts, no real data):**

```bash
STACK=gabee-staging IMAGE_TAG=staging docker compose -p gabee-staging \
  --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml \
  run --rm -e STAGING_FIXTURES=1 migrate \
  pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts
```

This runs `packages/db/prisma/seed-fixtures.ts` one-off inside the `migrate`
service's image (the same `web` build — it carries the full monorepo
`node_modules`, including `tsx`, plus the generated Prisma client, so no
extra install step is needed). The script hard-refuses to run unless
`STAGING_FIXTURES=1` is set, as a guard against ever pointing it at prod. It
upserts by fixed UUIDs, so it's safe to re-run. Expect
`fixtures OK — parents=2 kids=3` on success.

## 4. Shared tester login

```
email:    tester1@staging.gabee.app
password: staging-pass
```

(`tester2@staging.gabee.app` shares the same password.) The password hash in
`seed-fixtures.ts` (`SHARED_HASH`/`SHARED_SALT`) is a real scrypt hash of
`staging-pass`, generated and verified against the app's own
`hashPassword`/`verifyPassword` — if you ever change the password, regenerate
both the hash/salt in `seed-fixtures.ts` **and** update this doc together, then
re-run the fixtures step (§3).

## 5. Basic-auth rotation

```bash
htpasswd -nbB tester 'NEW_PASSWORD' | sed 's/\$/\$\$/g'
# update WEB_BASIC_AUTH= in .env.staging with the new (already $$-doubled) value

STACK=gabee-staging IMAGE_TAG=staging docker compose -p gabee-staging \
  --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml \
  up -d web kid
```

Only `web` and `kid` need restarting — they're the services carrying the
`${STACK}-auth` Traefik middleware label. `db`/`migrate` are untouched.

## 6. Teardown

```bash
docker compose -p gabee-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml down -v
```

`-v` drops the `gabee-db` volume for this project — the staging database is
gone. Fine, since everything in it is either re-copyable from prod
(§3, curriculum) or re-generatable (§3, fixtures). To bring staging back up
from scratch afterward, repeat §2 onward (the `.env.staging` file survives
teardown; only the compose-managed volume is deleted).

## 7. Ongoing: auto-deploy

Every push to `main` triggers the `Staging` workflow
(`.github/workflows/staging.yml`): it builds and pushes
`gabee-web:staging`/`gabee-kid:staging` images, then SSHes into the VPS,
`git reset --hard origin/main`s the `~/gabee-staging` checkout, pulls the new
images, and runs `docker compose ... up -d db migrate web kid` — which
re-applies `migrate deploy` against the staging DB on every deploy.

**Check the `Staging` workflow is green before cutting a `v*` release tag.**
A red run means either the build failed or `migrate deploy` failed against
staging's schema — the same migration is about to hit prod, so catch it here
first.
