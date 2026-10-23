# Content Studio ("Communication") — operator runbook

For the owner running production alone. It covers the one-time setup before
go-live, the first week, the daily routine, what to do when something breaks,
and how AI costs are set.

Spec: `docs/superpowers/specs/2026-10-20-content-studio-design.md`. Admin
screens live under `https://admin.gabee.app/admin/communication`.

Every command below runs **on the VPS, in the app directory** (`~/gabee` for
the `deploy` user, the directory `release.yml` deploys into). Do not open or
print `.env.production`. Commands that need a secret read it **inside** the
container, which is why they are wrapped in single quotes.

---

## 1. What the studio does

Each week Gabee proposes a direction for the coming week, drafts one post per
platform for each day (LinkedIn and TikTok), and reminds you when something is
waiting. You choose, edit, approve and **post by hand**. Then you record the link
of the post. Every post link carries tracking tags, so the Audience screen shows
which posts bring visits and sign-ups. A sidecar (`cron-content`) pokes the app
every 10 minutes, and the app decides which jobs are due.

All times are **studio time**: Réglages → Emails et horaires → Fuseau horaire,
which defaults to `Africa/Douala` (UTC+1, no daylight saving).

| When (Douala) | What happens |
|---|---|
| Sunday 06:00 | Gabee proposes 3 directions for next week (job `week.propose`) |
| Sunday 07:00 | Sunday email: last week's report + the 3 directions (`week.email`) |
| Sunday, any time | You pick a direction → titles for each day → **Valider la semaine** |
| Sunday 15:00 and 20:00 | Reminder if the week is not validated (`week.remind`) |
| Every day 04:00 | Drafts for the day are written (`day.generate`) |
| Every day 05:00 | Email with the day's drafts (`day.notify`) |
| Every day 09:00 and 13:00 | Reminder for drafts not approved or not marked published (`day.remind`) |
| Every hour | Budget check (`budget.check`) |

If the app was down, a job still runs on the first tick after recovery while its
window is open (until 23:59 that day). Each job runs at most once per period:
an extra tick does nothing.

---

## 2. One-time setup (before the release that ships the studio)

### 2.1 R2 bucket for media

Cloudflare dashboard → R2 → **Create bucket**:

| Field | Value |
|---|---|
| Name | `gabee-media` |
| Location | your choice (the backups bucket uses EUR) |
| Public access | **off** (no r2.dev URL, no custom domain) — the app only hands out 15-minute signed links |

### 2.2 API token scoped to that bucket only

R2 → Manage R2 API Tokens → **Create API token**:

| Field | Value |
|---|---|
| Token name | `gabee-media-web` |
| Permissions | Object Read & Write |
| Specify bucket | `gabee-media` **only** |
| TTL | Forever |

**Do not reuse the backups token** (`gabee-backup-sidecar`, see
`docs/backups.md`). The web container already carries the backup `R2_*` keys,
which is why media has its own `MEDIA_R2_*` names. A shared token would let the
web app write into the database backups.

Cloudflare shows the secret **once**. Store it in the password manager.

### 2.3 Bucket CORS (required for uploads)

Uploads go **straight from your browser to R2** with a signed `PUT`, so the
bucket must accept requests from the admin. Bucket → Settings → **CORS Policy**:

```json
[
  {
    "AllowedOrigins": ["https://admin.gabee.app"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

The origin must match exactly: `https`, no trailing slash. The browser sends
`Content-Type` on the `PUT`, and the signature covers it.

### 2.4 Environment variables (`.env.production` on the VPS)

Add or check these before you tag the release, so the deploy's `up -d` starts
`web` with them. Placeholders are in `.env.production.example`, and the schema
is in `apps/web/src/lib/server/env.ts`.

| Variable | Value | Notes |
|---|---|---|
| `MEDIA_R2_ACCOUNT_ID` | your Cloudflare account id | the `<account-id>` in `https://<account-id>.r2.cloudflarestorage.com` |
| `MEDIA_R2_ACCESS_KEY_ID` | from 2.2 | |
| `MEDIA_R2_SECRET_ACCESS_KEY` | from 2.2 | |
| `MEDIA_R2_BUCKET` | `gabee-media` | |
| `ANTHROPIC_API_KEY` | Anthropic key | probably already set (question authoring uses it); check |
| `CRON_SECRET` | ≥ 32 characters | already set for `cron-digest`; `cron-content` reuses it |
| `ADMIN_DIGEST_TO` | optional | comma-separated; seeds the studio's first recipients, and is the fallback when Réglages has none |
| `ADMIN_APP_URL` | optional | base of the links in studio emails; defaults to `https://admin.gabee.app` |

The studio only needs all four `MEDIA_R2_*` variables. If any one is missing,
every media action answers `storage_unavailable` (section 5.6). Never set
`STORAGE_DRIVER=memory` in production: production refuses it, and every media
action then answers `storage_unavailable`.

If you change `.env.production` **after** the deploy, recreate `web` so it
reads the file again (it restarts in a few seconds):

```bash
docker compose --env-file .env.production up -d --no-deps --force-recreate web
```

### 2.5 Deploy

Ship as usual (tag from `main`, see the release workflow). The deploy runs:

- the one-shot `migrate` service: `prisma migrate deploy`, which creates the
  studio tables (migration `20261020182222_content_studio`), then
  `db:seed:content-studio`, which creates the studio defaults (2.6);
- `docker compose --env-file .env.production up -d`, which also starts the new
  `cron-content` service (same `gabee-cron-digest` image, `tick-loop` mode).

Check that the tick is alive:

```bash
docker compose --env-file .env.production ps cron-content
docker compose --env-file .env.production logs --tail 20 cron-content
```

Expected: `[tick-loop] started — every 600s, target http://web:3000/api/cron/content-tick`,
then one `[tick] <time> {"ran":[…],"skipped":…}` line per tick. If it ever
stops: `docker compose --env-file .env.production up -d cron-content`.

### 2.6 Studio defaults (automatic on every deploy)

The studio needs its defaults: settings, model catalogue and routes, platform
profiles, editorial line v1, and the five agents (strategist, writer_linkedin,
writer_tiktok, art_director, analyst). Without them, no AI step can run.

**The deploy creates them for you.** The `migrate` service runs
`pnpm --filter @gabee/db run db:seed:content-studio` right after
`prisma migrate deploy`, before `web` and `cron-content` start. It is
create-only: it never overwrites what you changed in Réglages or in the
database, so running it on every deploy is harmless. If it fails, `migrate`
fails, the deploy job fails and the new `web` does not start: read
`docker compose --env-file .env.production logs migrate`.

Check after the deploy:

```bash
docker compose --env-file .env.production logs migrate | tail -5
```

Expected last line: `Content Studio defaults ensured`.

Manual fallback (same script, for example after restoring a backup taken
before the studio existed). Do **not** use `db:seed` for this: it also **wipes
and reloads the question tables** (see the content step of the prod release
process).

```bash
docker compose --env-file .env.production run --rm migrate \
  pnpm --filter @gabee/db run db:seed:content-studio
```

What it creates when missing:

- `studio_settings`: timezone `Africa/Douala`, recipients taken from
  `ADMIN_DIGEST_TO`, budget 50 USD/month, alert at 80 %;
- `ai_models` and `ai_task_routes`: see section 6;
- `platform_profiles`: `linkedin`, `tiktok`;
- editorial line v1 and agent instructions v1 (from
  `packages/db/prisma/content-studio/agents/*.md`). Editing those files after
  the seed has no effect, because a new agent version is needed (Phase 1b).

---

## 3. First-run checklist (launch week, October 2026)

Weekdays: **Tue 27 Oct, Wed 28 Oct, Thu 29 Oct** 2026, **Sun 1 Nov**.

1. **Réglages → Emails et horaires**: put the recipients (one per line, 10
   max) and check the timezone.
2. **Réglages → Objectif du mois**: set the **October 2026** objective. A
   week takes the objective of the month of its **Monday**, and the launch week
   starts Monday 26 Oct. Set **November** before Sunday 1 Nov 06:00, because the
   week of 2 Nov uses it.
3. **Réglages → Ligne éditoriale**: reread the text and the **Faits produit**
   (ages, free offer, paid offer). Agents state only these facts. As long as
   "Une offre payante existe" is off, they never mention a paid offer.
4. **Réglages → Budget IA**: monthly budget and alert threshold.
5. **Médiathèque → Téléverser un fichier**: upload a first file. **This is
   the test of the bucket CORS and token** (the automated tests stub this step).
   Expected: a progress bar, then "Vérification du fichier…", then the file in
   the list. If it fails, see section 5.6. Then:
   - **Autoriser** the file (only cleared media can be attached or approved);
   - upload and clear at least one **vertical (9:16) video**, because a TikTok
     post is a video;
   - click **Télécharger** once to test the signed download link.
6. **Launch the first week**: on **Wednesday 28 Oct**, click **Lancer la
   semaine maintenant** (Aujourd'hui or Semaine). Started Monday to Saturday,
   a week covers **tomorrow to Sunday**: launched on the 28th, the first post is
   on **Thursday 29 Oct** (4 days, at least 1 English post per platform).
   Launched on Tue 27th, it would start Wed 28th instead. Then, in Semaine:
   pick a direction → **Arrêter cette direction** → review the titles →
   **Valider la semaine**.
7. On the first draft (Thu 29 Oct, Aujourd'hui), try **Copier le texte** once
   on a **real iPhone with Safari**. If copying is refused, the card says to
   select the text by hand. Note it for a fix.
8. **Sunday 1 Nov** runs by itself: proposals at 06:00, email at 07:00.

---

## 4. Daily operation

1. The **05:00 email** links to **Aujourd'hui**. Unfinished items from yesterday
   are at the top ("À terminer depuis hier").
2. On each card: read the preview, then **Modifier** or **Régénérer** if needed,
   then **Valider**.
3. **Copier le texte** → paste into LinkedIn / TikTok. **Télécharger le média**
   gives a fresh link (valid 15 min) and a readable file name
   (`YYYY-MM-DD-<platform>-<slug>.<ext>`). Check the file, then post it by hand.
4. **Marquer comme publié** → paste the post's full address (`https://…`).
   You can add a note (1–5) and a comment, which the agents learn from.
5. **TikTok**: when no cleared vertical video fits, the draft is a **filming
   plan** (hook, on-screen text, shots). Film it, upload it in Médiathèque
   (format 9:16), **Autoriser**, attach it on the card (**Modifier → Choisir un
   média → Joindre ce média**), then **Valider**.
6. **Audience**: visits per day and per source, and sign-ups per source and per
   post. TikTok is counted per platform through the bio link, not per post.

Reminders stop once everything is approved and marked published. To skip a
day, click **Sauter** on its line in Semaine and give a reason. That day then
gets no drafts and no reminders.

---

## 5. Troubleshooting

### 5.1 Force a tick

```bash
docker compose --env-file .env.production exec cron-content \
  sh -c 'curl -sS --fail-with-body --max-time 300 -X POST -H "Authorization: Bearer $CRON_SECRET" http://web:3000/api/cron/content-tick'
```

`$CRON_SECRET` expands inside the container because of the single quotes.
The answer is `{"ok":true,"summary":{"ran":[…],"skipped":N}}`. `ran` lists
each job this tick ran, with its status: `succeeded`, `waiting` (not ready yet,
for example the week isn't validated), `failed` (will retry with backoff) or
`abandoned`. Extra ticks are harmless.

- `401 unauthorized`: the sidecar's `CRON_SECRET` differs from the one `web`
  has. Recreate both after fixing `.env.production`.
- `503 cron_disabled`: `web` has no `CRON_SECRET`.
- The sidecar's own log shows the same thing on every tick:
  `docker compose --env-file .env.production logs --tail 50 cron-content`
  (`[tick] … FAILED (curl rc=…)`).

### 5.2 Read the Journal

**Communication → Journal** (`/admin/communication/journal`):

- **Tâches planifiées**: one row per job and period (job, period, status,
  attempts, error).
- **Appels aux agents**: one row per agent run (agent, version, model, tokens,
  cost, outcome, error).
- **Afficher → Échecs seulement** keeps only failures. **Actualiser** reloads.
  Successful hourly budget checks are hidden.

Errors are also in Sentry, and a job that gives up emails the recipients.

### 5.3 Abandoned jobs (4 attempts)

A failing job is retried on later ticks with backoff. After **4 attempts** it
becomes **abandoned**: one email, one Sentry event, a banner in the Journal,
and **no more paid retries**. The scheduler also never rewrites a draft that
failed. Retry from the screens:

- a failed draft: **Réessayer** on its card (Aujourd'hui);
- a week stuck while preparing proposals: **Relancer les propositions**;
- titles that failed: **Arrêter cette direction** again (Semaine).

An abandoned **email** (`day.notify`, `week.email`, `week.remind`,
`day.remind`) is not resent, but the screens work without it.

Last resort, to make the scheduler run an abandoned job again **while its
window is still open (same day)**: back up (`docker compose run --rm backup
backup`), delete its row, then force a tick (5.1).

```bash
docker compose --env-file .env.production exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' <<'SQL'
SELECT job_key, period_key, status, attempts, error FROM job_runs WHERE status = 'abandoned' ORDER BY updated_at DESC LIMIT 10;
-- then, for the one to rerun (example):
-- DELETE FROM job_runs WHERE job_key = 'day.notify' AND period_key = 'day:2026-10-29';
SQL
```

### 5.4 "Gabee travaille déjà dessus" (`generation_in_progress`)

A week-level AI operation (proposals, direction → titles, regenerating a day)
on that week started less than **10 minutes** ago and is still running. Wait,
then reload. If that run crashed, the same action works again once the 10
minutes are up.

### 5.5 Budget alert

The hourly check emails the recipients once per month when the month's
Communication spend reaches the threshold (default 80 % of 50 USD). Question
authoring is not counted. **In Phase 1a nothing stops**: generation continues.
See the spend in **Réglages → Budget IA → Voir la dépense**
(`/admin/ops/ai-usage`). Then raise the budget, or move routes to a cheaper
model (section 6).

### 5.6 `storage_unavailable` / uploads that fail

- **Every media action fails with "Le stockage des médias ne répond pas ou
  n'est pas configuré"**: one of the four `MEDIA_R2_*` variables is missing in
  `web`, or `STORAGE_DRIVER=memory` is set. Fix `.env.production`, then
  recreate `web` (2.4). If the variables are there, R2 itself refused the
  request (wrong account id, revoked token, bucket name typo). The error is in
  Sentry.
- **The upload stops during "Envoi du fichier"**: the browser's `PUT` to R2
  was refused. Open the browser console. A CORS message means the bucket CORS
  is wrong (origin exactly `https://admin.gabee.app`, method `PUT`, header
  `Content-Type`). A `403` means the token or its bucket scope is wrong.
- **"Vérification du fichier…" rejects the file**: the server checked the
  stored object (size, real file type) and it did not match. Allowed: PNG,
  JPEG, WebP up to 15 MB, MP4 up to 300 MB.

### 5.7 AI unavailable (`ai_unavailable`)

"Le service d'IA est indisponible" means no model in the task's chain could
run. The Journal error lists each model with its reason:

- `no_key`: `ANTHROPIC_API_KEY` is missing in `web`;
- `unhealthy`: 3 outages in a row took the model out for 5 minutes, so it
  comes back by itself;
- `disabled` / `incapable` / `invalid_effort`: a catalogue row is wrong
  (section 6);
- otherwise an Anthropic outage, rate limit or timeout. Retry later; nothing is
  lost.

A **refusal** or an invalid request never falls back to another model. That
is by design.

---

## 6. Costs and models

Model ids and prices live **in the database**, never in the code. Each call's
cost is computed from these prices when the call is made and stored in
`ai_usage.cost_usd`. The budget adds up the rows where `ai_usage.task` is set
(Communication only), over the studio-local month.

- `ai_models`: `key` (the Anthropic model id), `provider`, `capabilities`,
  `input_usd_per_mtok`, `output_usd_per_mtok`, `enabled`,
  `consecutive_failures`, `unhealthy_until`.
- `ai_task_routes`: `task`, `rank` (1 = first choice, 2 = fallback…),
  `model_key`, `effort` (`low` | `medium` | `high` | `xhigh` | `max`),
  `max_tokens`.

Seeded:

| Task | Used for | Model (rank 1) | Effort | Max tokens |
|---|---|---|---|---|
| `content_strategy` | 3 directions | `claude-opus-5-5` | high | 16000 |
| `content_titles` | the week's titles | `claude-opus-5-5` | high | 16000 |
| `post_linkedin` | LinkedIn draft | `claude-opus-5-5` | medium | 8000 |
| `post_tiktok` | TikTok draft | `claude-opus-5-5` | medium | 8000 |
| `art_direction` | media choice | `claude-opus-5-5` | low | 4000 |
| `report_narrative` | Sunday report | `claude-opus-5-5` | medium | 8000 |

Catalogue prices (USD per million tokens, input / output): `claude-opus-5-5`
4 / 20, `claude-sonnet-5-5` 2 / 10, `claude-haiku-5-5` 0.10 / 0.50. Sonnet and
Haiku are enabled but not routed.

There is no editing screen until Phase 1b, so changes go through SQL. Back up
first (`docker compose run --rm backup backup`). The router reads the
catalogue on every call, so a change applies to the next call, with no restart.

```bash
docker compose --env-file .env.production exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' <<'SQL'
-- Move one task to a cheaper model:
UPDATE ai_task_routes SET model_key = 'claude-sonnet-5-5', updated_at = now() WHERE task = 'post_linkedin' AND rank = 1;
-- Update a price after Anthropic changes it:
UPDATE ai_models SET input_usd_per_mtok = 4, output_usd_per_mtok = 20, updated_at = now() WHERE key = 'claude-opus-5-5';
-- Check:
SELECT task, rank, model_key, effort, max_tokens FROM ai_task_routes ORDER BY task, rank;
SQL
```

A route must point to an enabled model whose `capabilities` include `text`.

---

## 7. Staging

`cron-content` does not run on staging, so nothing happens on a schedule there.
To run the loop by hand, use **Lancer la semaine maintenant** and the screens.

## 8. Media files are not in the database backups

See `docs/backups.md` § "Media files (R2 bucket `gabee-media`)".
