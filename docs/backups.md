# Database backups — operator runbook

A `backup` sidecar in `docker-compose.yml` runs nightly inside the same VPS as
the Postgres `db` service. Every night it `pg_dump`s the database, gzips the
output, uploads it to Cloudflare R2 via the S3-compatible API, then prunes
anything older than the retention window. Nothing is written to the host
filesystem — backups exist exclusively in R2.

This file is the runbook: how to provision the R2 bucket, what to check after
deploy, how to restore, how to troubleshoot.

## 1. Provision the R2 bucket (one-time)

Cloudflare dashboard → R2 → **Create bucket**.

| Field        | Value                  |
| ------------ | ---------------------- |
| Name         | `gabee-db-backups`     |
| Location     | EUR (closest to VPS)   |
| Storage      | Standard (no IA tier)  |

After creation, capture the **S3 API endpoint** shown under "Settings →
Bucket details" — it looks like `https://<account-id>.r2.cloudflarestorage.com`.

Then **R2 → Manage R2 API Tokens → Create API token**:

| Field                | Value                            |
| -------------------- | -------------------------------- |
| Token name           | `gabee-backup-sidecar`           |
| Permissions          | Object Read & Write              |
| Specify bucket       | `gabee-db-backups`               |
| TTL                  | Forever                          |

Cloudflare shows the access key + secret **once**; store them in the password
manager and copy them into `.env.production` on the VPS:

```ini
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="…"
R2_SECRET_ACCESS_KEY="…"
R2_BUCKET="gabee-db-backups"
```

## 2. Deploy

```bash
# On the VPS, in the project directory
docker compose --env-file .env.production up -d --build backup
docker compose logs -f backup
```

The container runs an **immediate startup backup** so misconfiguration
(wrong creds, unreachable R2, wrong PG host) shows up within a minute of
deploy, not the next morning. Expected log shape:

```
[backup-loop] started — daily at 3:00 UTC, retention 14d, target s3://gabee-db-backups/backups/
[backup] dumping gabee@db → /tmp/gabee-20260605T120401Z.sql.gz
[backup] dump complete (4823017 bytes) → uploading to s3://gabee-db-backups/backups/gabee-20260605T120401Z.sql.gz
[backup] uploaded backups/gabee-20260605T120401Z.sql.gz
[backup] pruning > 14 days old
[backup] pruned 0 old backup(s)
[backup] done
[backup-loop] startup backup OK
[backup-loop] next run in 53759s (2026-06-06T03:00:00Z)
```

If the startup backup fails, the loop keeps going (retries the next cycle),
but the error is logged to stderr. **Always tail the logs after deploy.**

## 3. Verify

List what's in the bucket without opening Cloudflare:

```bash
docker compose run --rm backup list
```

Run an ad-hoc backup (does not affect the schedule):

```bash
docker compose run --rm backup backup
```

## 4. Restore

> ⚠ Restoring uses `pg_dump --clean --if-exists`, which means existing tables
> are **dropped and recreated** from the backup. Any data written since the
> backup timestamp is **lost**. Always check the candidate backup is the one
> you actually want before confirming.

Interactive restore (the prompt requires you to type the database name):

```bash
docker compose run --rm backup restore latest
# or pick a specific dump:
docker compose run --rm backup restore gabee-20260604T030001Z.sql.gz
```

Scripted restore (DR drills, automation) — bypasses the prompt:

```bash
docker compose run --rm backup restore latest --no-confirm
```

After the restore completes, run `docker compose restart web` so the Next.js
process drops any cached Prisma metadata and reconnects.

## 5. Quarterly DR drill (recommended)

Once a quarter, restore the latest backup into a throwaway DB and verify the
schema + a handful of representative rows match the live DB. The simplest
recipe:

```bash
# On any machine with docker + access to R2
docker compose -f ops/backup/drill.yml run --rm restore-drill
```

(That compose file is left as an exercise — for MVP we run the drill manually
by spinning up a local Postgres + pointing `restore` at it.)

## 6. Troubleshooting

| Symptom                                | Likely cause                                                                  | Fix                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `R2_ENDPOINT is required`              | Env var missing on the VPS                                                    | Add to `.env.production`, `docker compose up -d backup`                                                                          |
| `An error occurred (403) when calling` | Token revoked, wrong creds, or token scoped to a different bucket             | Recreate the token in Cloudflare; copy new creds into `.env.production`                                                          |
| `could not translate host name "db"`   | Backup container started before `db` was healthy                              | Should not happen — `depends_on.db.condition: service_healthy` covers it. If it does, `docker compose restart backup`            |
| `pg_dump: server version: 17.x; pg_dump version: 16.x` | Postgres image major bumped past 16                                       | Bump `postgresql16-client` → `postgresql17-client` in `ops/backup/Dockerfile`, rebuild                                            |
| Loop runs but no files in R2           | Pruning happens BEFORE we'd see anything; check the upload log line above it. | `docker compose logs backup` for the actual error; common cause is bucket name typo                                              |
| `[backup-loop] startup backup FAILED`  | First-run misconfig                                                           | Inspect the lines above for the exact error; the loop will retry on schedule                                                     |
