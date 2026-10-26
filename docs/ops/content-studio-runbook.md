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
platform on each of that platform's posting days (LinkedIn and TikTok, see
1.1), and reminds you when something is waiting. You choose, edit, approve and **post by hand**. Then you record the link
of the post. Every post link carries tracking tags, so the Audience screen shows
which posts bring visits and sign-ups. A sidecar (`cron-content`) pokes the app
every 10 minutes, and the app decides which jobs are due.

All times are **studio time**: Réglages → Emails et horaires → Fuseau horaire,
which defaults to `Africa/Douala` (UTC+1, no daylight saving).

| When (Douala) | What happens |
|---|---|
| Sunday 06:00 | Gabee proposes 3 directions for next week (job `week.propose`) |
| Sunday 07:00 | Sunday email: last week's report + the 3 directions (`week.email`) |
| Sunday, any time | You pick a direction → titles for each posting day → **Valider la semaine** |
| Sunday 15:00 and 20:00 | Reminder if the week is not validated (`week.remind`) |
| Every day 04:00 | Drafts for the day are written (`day.generate`) |
| Every day 05:00 | Email with the day's drafts (`day.notify`) |
| Every day 09:00 and 13:00 | Reminder for drafts not approved or not marked published (`day.remind`) |
| Every hour | Budget check (`budget.check`) |

If the app was down, a job still runs on the first tick after recovery while its
window is open (until 23:59 that day). Each job runs at most once per period:
an extra tick does nothing.

### 1.1 Posting days, editorial mix and English

**Cadence** (Réglages → **Jours de publication**, studio days):

| Platform | Default days | Posts a week |
|---|---|---|
| LinkedIn | Tuesday, Wednesday, Thursday | 3 |
| TikTok | Monday, Wednesday, Friday, Sunday | 4 |

A week has one line per day on which at least one platform posts, with only
the platforms posting that day: by default Monday to Friday and Sunday, none
on Saturday. The 04:00 job writes the drafts of the platforms on the day's
line; a day without a line gets no draft, no email and no reminder. A week
started mid-week (**Lancer la semaine maintenant**) plans the posting days from
tomorrow to Sunday; if none is left, the launch is refused.

**Mix** — each day has a pillar, shown as a chip on its line in Semaine:

- **Gabee** (`gabee`): about Gabee itself (product, module, offer), **3 days a
  week at most**;
- **Léger** (`light`): to liven up the account (news, « Le saviez-vous ? », a
  game or riddle, an event in kids' games or education, an observance day),
  **at least 1 day a week**;
- **Conseil** (`value`): useful content for parents, the other days.

Léger and Conseil posts do not sell. The Strategist must follow the mix (an
answer that breaks it is refused and retried once). You can change a day's
pillar in **Modifier**; the line « 2 sur Gabee · 1 léger · 3 conseils » then
warns if the week breaks the mix, but never blocks validation.

**English**: at least **1 English post per platform per week**. In a week
started mid-week, only a platform with 2 posts or more left needs one.
**Valider la semaine** refuses a week below that minimum unless you tick
« Valider quand même ».

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
every media action answers `storage_unavailable` (section 5.7). Never set
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
  `packages/db/prisma/content-studio/agents/*.md`).

**Agent instructions follow the files.** When an instruction file changes in a
release, the deploy publishes it as the agent's next version, as long as the
version the agent runs came from these files. A version written by an owner
(`agent_versions.source = 'owner'`), or a live version the owner chose, is
never replaced. Earlier versions stay as history, and a deploy that changes
no file changes nothing. The `migrate` log names each upgraded agent
(`Agent strategist: instructions file published as a new version`) before
`Content Studio defaults ensured`.

---

## 3. Go-live: launch on Sunday 25 October 2026

**Target: deploy and finish the setup below before Sunday 25 Oct, 06:00
Douala time (05:00 UTC).** The studio then starts by itself: the Sunday 06:00
tick proposes the week of **Monday 26 Oct**, and the first posts are drafted
on Monday morning. All times below are Douala time.

### 3.1 Before Sunday 06:00

1. **Infrastructure** (section 2): R2 bucket, token and CORS (2.1–2.3), the
   `.env.production` variables (2.4), then the release (2.5).
2. **Check the deploy**:
   - `docker compose --env-file .env.production logs migrate | tail -5` ends
     with `Content Studio defaults ensured` (2.6, automatic);
   - `docker compose --env-file .env.production logs --tail 20 cron-content`
     shows `[tick-loop] started …` then one `[tick] <time> {"ran":[…],…}`
     line every 10 minutes. A `[tick] … FAILED` line: see 5.1.
3. **Réglages → Emails et horaires**: the recipients (one per line, 10 max)
   and the timezone (`Africa/Douala`).
4. **Réglages → Objectif du mois**: the **October 2026** objective. A week
   takes the objective of the month of its **Monday**, so the week of Mon 26
   Oct uses October. Every AI run reads the objective as it is at that moment,
   so one set late still counts from the next run on (see 4.1).
5. **Réglages → Ligne éditoriale**: reread the text and the **Faits produit**
   (ages, free offer, **paid offer**). Agents state only these facts. As long
   as "Une offre payante existe" is off, they never mention a paid offer.
6. **Réglages → Budget IA**: monthly budget and alert threshold.
7. **Médiathèque → Téléverser un fichier**: upload a first file. **This is the
   first real test of the bucket CORS, the token and the signed upload** (the
   automated tests stub this step). Expected: a progress bar, then
   "Vérification du fichier…", then the file in the list. If it fails, see
   section 5.7. Then:
   - **Autoriser** the file (only cleared media can be attached or approved);
   - upload and clear at least one **vertical (9:16) video**, because a TikTok
     post is a video;
   - click **Télécharger** once to test the signed download link.

Do **not** click **Lancer la semaine maintenant** before Sunday: on Monday to
Saturday it starts the **current** week from tomorrow (on Saturday 24, a
one-day week for Sunday 25), not the week of the 26th.

### 3.2 Sunday 25 and Monday 26

| When | What happens | What you do |
|---|---|---|
| Sun 06:00 | Gabee proposes 3 directions for the week of Mon 26 | nothing |
| Sun 07:00 | Sunday email with the 3 directions | open **Semaine** from the email |
| Sunday, during the day | | pick a direction → **Arrêter cette direction** → review the titles → **Valider la semaine** |
| Sun 15:00, 20:00 | Reminder if the week is not validated | |
| Mon 26, 04:00 | The day's drafts are written | |
| Mon 26, 05:00 | Email with the day's drafts | review, **Valider**, post by hand, **Marquer comme publié** (section 4) |

If the week is validated after Monday 04:00, the day's drafts arrive within
about 10 minutes, and their email on the following tick.

On the first draft, try **Copier le texte** once on a **real iPhone with
Safari**. If copying is refused, the card says to select the text by hand.
Note it for a fix.

### 3.3 If the deploy slips past Sunday 06:00

The Sunday proposal job stays due until **Sunday 23:59**, and `cron-content`
pokes the app as soon as it starts. So a deploy later on Sunday proposes the
week **at once**, before you can do the setup of 3.1. To keep the setup first:

1. Right after the deploy, stop the tick:
   `docker compose --env-file .env.production stop cron-content`.
2. Do steps 3–7 of 3.1.
3. Start the tick again:
   `docker compose --env-file .env.production up -d cron-content`. Its
   startup poke proposes the week of Mon 26 (still Sunday). Or click
   **Lancer la semaine maintenant** (on a Sunday it starts next Monday's
   week); either way, keep `cron-content` running for Monday 04:00.

If the deploy happens **on Monday 26 or later**, the Sunday job no longer
runs: once the setup is done, click **Lancer la semaine maintenant**
(Aujourd'hui or Semaine). It plans the current week **from tomorrow** (for
example, launched Tue 27: the posting days from Wed 28 to Sun 1 Nov; see 1.1
for the English minimum of such a week).

If the week of Mon 26 **already exists** (for example it was proposed before
the setup was complete), open it in **Semaine**:

- still preparing proposals and nothing moves for 20 minutes, or it failed:
  **Relancer les propositions**;
- proposals ready (or titles written, not yet validated) but made before the
  objective or the editorial line was set: **Régénérer les propositions**
  (section 4.1).

### 3.4 After launch

- **Set the November 2026 objective before Sunday 1 Nov, 06:00**: the week of
  Mon 2 Nov uses it.
- Sunday 1 Nov runs by itself: proposals at 06:00, email at 07:00.
- Check the tick from time to time:
  `docker compose --env-file .env.production logs --tail 20 cron-content`
  (one `[tick]` line every 10 minutes).

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

### 4.1 Regenerate the week's proposals

**When**: the week's directions are not right, typically because the Sunday
06:00 run went out before the month's objective (or a new editorial line) was
set. Semaine then says "Ces propositions ont été préparées sans objectif du
mois" once the objective exists, and the Sunday email says no objective was
set. Set the objective first (**Réglages → Objectif du mois**, super-admin),
then in **Semaine** click **Régénérer les propositions** (steps 1 and 2) and
confirm.

**What it replaces**: the 3 directions, the chosen direction, your precision,
the per-platform angles and every day line (with your edits to them). Gabee
proposes 3 new directions with the objective and editorial line as they are
now, and the week goes back to step 1. It is offered only **before
validation**; on a validated week, regenerate day by day (**Régénérer** on a
line), which also reads the current objective. While a proposals or titles run
is going on the week, it is refused (5.4). If the run fails, the week waits in
step 1 with **Relancer les propositions**.

**Cost**: one Strategist proposals run (`content_strategy`, with web search),
the same as the Sunday run. Choosing a direction afterwards costs one titles
run, as usual.

### 4.2 Change the posting days

**Réglages → Jours de publication** (super-admin): one row per platform,
click the days on or off, then **Enregistrer les jours**. Each active platform
keeps at least one day. The new days count for every week planned afterwards.

A week already **validated** keeps its lines. If this week (or next week) is
validated and its days to come would change, Réglages offers **Appliquer le
rythme à la semaine en cours** (or « … prochaine »); the same button sits on
the validated week in **Semaine**. It first shows what changes, for example
« 2 jours ajustés, 1 jour sauté », then on **Appliquer**:

- only the days **after today** change; today, past days and days that already
  have drafts stay as they are;
- each changed day takes the platforms that post on that weekday (a kept
  platform keeps its language, a new one starts in French);
- a day no platform posts on any more is skipped (reason « Nouveau rythme »);
- if a platform loses its only English post, another of its upcoming posts
  switches to English; when none can, the dialog says so;
- a day the new rhythm adds but that has no line this week stays without a
  post until next week.

No AI runs: it costs nothing. Running it again changes nothing.

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

A week-level AI operation (proposals, regenerating the proposals, direction →
titles, regenerating a day) on that week started less than **20 minutes** ago and is still running. Wait,
then reload. If that run crashed, the same action works again once the 20
minutes are up: the crashed run then shows in the Journal as failed
(`abandoned`). The database holds at most one running Strategist run per
week, so two clicks (or two tabs) at the same moment still start only one
paid run.

### 5.5 "La connexion a été coupée ; Gabee continue peut-être"

An AI step (proposals, titles) can take longer than Cloudflare waits for an
answer (100 seconds). The browser then gets no answer, but the server keeps
working. **Wait**: Aujourd'hui and Semaine re-read the week every 15–20
seconds and update by themselves when the step is done. Do not click again.
If nothing changes for 20 minutes, the run died: Semaine then offers
**Relancer les propositions**.

### 5.6 Budget alert

The hourly check emails the recipients once per month when the month's
Communication spend reaches the threshold (default 80 % of 50 USD). Question
authoring is not counted. **In Phase 1a nothing stops**: generation continues.
See the spend in **Réglages → Budget IA → Voir la dépense**
(`/admin/ops/ai-usage`). Then raise the budget, or move routes to a cheaper
model (section 6).

### 5.7 `storage_unavailable` / uploads that fail

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
- **Abandoned uploads clean themselves up**: an upload cancelled, failed or
  left in a closed tab stays an invisible `pending` row. The daily purge
  (`/api/cron/purge-device-ips`) deletes `pending` rows untouched for 24 h
  with their R2 object, and puts a `verifying` row stuck for over an hour (a
  crash mid-check) back to `pending`. Its log line counts them under
  `media_uploads`.

### 5.8 AI unavailable (`ai_unavailable`)

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
