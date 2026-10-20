# Content Studio ("Communication") — design spec, Phase 1

**Date:** 2026-10-20
**Status:** Draft — awaiting owner approval (builder check done)
**Branch:** `docs/content-studio-spec` (off `develop`)

## Why

Gabee needs steady, measurable growth: more daily activity, more sign-ups and —
once the paid offer ships (planned before end of October 2026) — paying families.
Today there is no marketing engine: no editorial plan, no regular posting, and no way
to tie a post to its effect.

The owner wants Gabee itself to run an editorial routine in production, using the
AI APIs, with a human in the loop at every publishing step:

- **Every Sunday morning**, one email: last week's results + the proposed editorial
  plan for the coming week, both shaped by the **objective of the month** and by
  **what performed last week**.
- **Sunday, before Monday morning**, the owner reviews the plan in the admin panel,
  picks and refines a direction, then validates the week's titles.
- **Every day at 05:00**, a notification with the day's drafts (one per platform).
  The owner reviews, approves, posts manually on each platform, then records the
  post as published with a link and feedback. Reminders fire when any step is late.
- Publishing APIs (LinkedIn, X, Facebook, TikTok) come later; until then the module
  only prepares content and records what was published.

## The whole programme, and what this spec covers

The programme is four phases, each usable on its own. **This spec is Phase 1.**

| Phase | Scope |
|---|---|
| **1. Editorial core** (this spec) | Multi-task AI layer with per-role agents · objectives & editorial line · weekly direction → titles → daily drafts per platform · Sunday email, 05:00 notification, reminders · "mark as published" + feedback · media library (upload / reuse existing assets) · tracked links (UTM) on every post |
| 2. Measurement | First-party visit + UTM capture on the landing site · per-post platform stats input (manual or from a screenshot) · progress report tying posts to visits, sign-ups, activity, problems |
| 3. Media factory | Production render service: on-demand gameplay captures, template videos (like the launch announcement), AI-generated images, generated template visuals. **Template videos + gameplay captures for TikTok are pulled forward to right after launch** |
| 4. Gabee universe | Recurring cast (Gabee the mascot + secondary characters), sets, and a story engine: an AI scriptwriter writes a structured script, an animation engine renders it (SheSpeaks-style) |

Phases 2–4 get their own specs. Phase 1 must not paint them into a corner: data
shapes for media, stats and agents are designed so they plug in without migration
pain (see "Forward hooks").

## Prerequisite: measuring visits and where they come from (in Phase 1a)

Gabee records no website visits today. Posting without it would make every early
post unmeasurable forever, so a **minimal, privacy-respecting measurement** ships
**before the first post**, as part of Phase 1a:

1. **Visits on gabee.app** (landing site): one record per page view — page, language,
   device class, and the **source**: the campaign parameters carried by the post's
   link (`utm_*`), otherwise the referring site (LinkedIn, TikTok, Google…), else
   "direct". **No tracking cookie, no stored IP address, no cross-site identifier**
   (Plausible/Umami-style counting: visits, not people).
2. **Sign-up attribution**: the source is carried in the links from the landing site
   to parents.gabee.app (sign-up) and kids.gabee.app (install), and stored on the
   parent account at sign-up (first source, plus the source of the sign-up visit).
3. **Admin view**: visits per day and per source, sign-ups per source, and per post
   (via `utm_content` = draft id) — the raw numbers the Phase 2 report builds on.

The privacy policy must mention this audience measurement and the sign-up source;
the owner has the new wording reviewed by their lawyer before go-live.

Bot traffic is filtered (user-agent rules); the endpoint is rate-limited and accepts
only first-party origins.

## Goals (Phase 1)

1. The weekly loop runs unattended in production: proposals generated, emails sent,
   drafts ready at 05:00, reminders sent, all on schedule and idempotent.
2. One **direction per week**, shared by all platforms by default (so the effect of
   each editorial orientation is measurable), with an optional per-platform override
   that changes **only the angle** that platform's writer takes on the shared daily
   topic — never the topic itself.
3. One **topic per day**, turned into a **distinct post per platform** — each written
   for that platform's objective and tone, never a copy-paste.
4. **Language per post**: French by default; **each platform gets at least 2 posts in
   English per week**, on days that may differ between platforms (e.g. LinkedIn in
   English on Thursday and Saturday, TikTok on Tuesday and Friday). The Strategist assigns
   a language to every (day, platform) when it proposes titles; the owner can switch
   any of them.
5. Each creative role is an **agent** with a stable, versioned behaviour and a memory
   of the editorial line, past posts, the owner's feedback and past performance.
6. The AI layer handles **text now and media later**, with per-task model chains,
   a backup provider slot, prices and model ids stored as data, and every call metered.
7. Every post carries a **tracked link**, and visits and sign-ups are attributed to it
   from the first post (see the prerequisite above).

## Non-goals (Phase 1)

- Automatic publishing to any platform (manual posting only; APIs are a later phase).
- Platform stats input and the full progress report (Phase 2). The Sunday email in
  Phase 1 reports Gabee's internal metrics, visits and sign-ups by source, and the
  publication log.
- Generating images or videos (Phase 3). Phase 1 attaches media from a library.
- The Gabee story universe (Phase 4).
- X, Facebook and Instagram. **Launch platforms are LinkedIn and TikTok** (the only
  accounts that exist today). The platform list is data: adding X or Facebook later
  is configuration plus a writer agent, no rebuild.
- Migrating the existing question-authoring AI (`apps/web/src/lib/server/ai/`) onto
  the new layer. It keeps working as is; migration is a follow-up.

## Anti-goals — what makes this a failure even if it "works"

These come from the owner and are acceptance criteria, not nice-to-haves:

- **UX that isn't clean and intuitive.** Every routine action (approve a draft, copy
  its text, download its media, mark it published) is reachable in one click from the
  screen the notification lands on. No hunting through menus. One obvious primary
  action per screen.
- **Not usable on a phone.** Review happens on a phone as well as a computer. The
  Aujourd'hui and Semaine screens, and the emails, are fully usable on a phone:
  read the preview, edit, approve, copy the text, download the media, mark
  published — without zooming or horizontal scrolling.
- **Unclear or clumsy text.** All admin copy is plain French (English toggle as the
  rest of the admin), short, specific. Error messages say what happened and what to do.
- **Sloppy implementation.** Follows the repo's existing patterns (services under
  `apps/web/src/lib/server/services`, route handlers under `api/admin/...`, zod
  contracts in `@gabee/types`, Prisma migrations), no dead code, no TODO-driven stubs.
- **Weak security** (see "Security").
- **Missing tests** (see "Testing"). Every behaviour that matters is covered at the
  right layer, with no network calls in tests.
- **Silent failures.** No error is swallowed. Every scheduled job and every AI call
  leaves a record; failures reach Sentry, the admin UI and the owner's inbox.
- **Poor metadata handling.** Model prices, model ids, agent versions, token usage,
  cost, latency, origin of each call — all stored, visible and editable where relevant.
- **Unpolished details.** Empty states, loading states, error states, timezones and
  bilingual copy are all designed, not left to defaults.

## The weekly rhythm

All times are in the **studio timezone** (a setting; default `Africa/Douala`, UTC+1).

| When | What happens | Who |
|---|---|---|
| Sunday 06:00 | Strategist proposes **3 directions** for next week, using the month's objective, the past week (previous Sunday → Saturday): publication log, the owner's ratings and comments, visits and sign-ups by source, internal metrics; and the calendar (observances, events). In Phase 1 there are no platform stats (views, reactions) — "what performed" means these signals only | system |
| Sunday 07:00 | **Sunday email**: last week's report + the 3 proposed directions, with a link to the Week screen | system |
| Sunday, any time | Owner picks a direction, edits it in free text, confirms → Strategist generates the **week's titles** (one topic per day, with format and target platforms) → owner validates, edits or regenerates each line, then validates the week | owner |
| Sunday 15:00 & 20:00 | **Reminder** if the week is not validated | system |
| Day D 04:00 | Writers generate the day's **drafts**, one per target platform; Art director attaches media | system |
| Day D 05:00 | **Daily notification**: the day's drafts, link to the Today screen | system |
| Day D | Owner reviews, edits/regenerates, approves, posts manually, then **marks each post published** (link + optional feedback) | owner |
| Day D 09:00 & 13:00 | **Reminder** for drafts not yet approved or not yet marked published | system |

Edge cases that must be handled:

- **Week validated late** (after Monday 04:00): Monday's drafts are generated
  immediately on validation and the notification is sent then.
- **A day's title edited after its drafts exist**: drafts are marked stale and the
  owner chooses to regenerate or keep them.
- **A day skipped**: the owner can mark a day "skipped" (with a reason); no reminders.
- **First week (launch)**: started with "Lancer la semaine maintenant" mid-week, the
  week is **partial** — slots only from the next day to Sunday; the per-platform
  English minimum scales down (at least 1 English post per platform on a partial
  week of 4 days or fewer).
- **No cleared media**: a post is valid as text only; the card says so plainly and
  offers to upload a file.
- **Week never validated**: no drafts are generated; reminders stop at the last
  reminder of Monday; the next Sunday report mentions it.

## Concepts and data

Names below are logical; the builder picks final Prisma names following the schema's
conventions (snake_case tables via `@@map`, uuid ids, `created_at`/`updated_at`).

**Studio settings** (singleton): timezone, notification recipients, enabled platforms,
schedule hours, monthly AI budget (USD) and alert threshold.

**Objective** — one active per month: a goal type (`signups`, `daily_activity`,
`paid_conversion`, `awareness`), a short statement, and optional target figures.

**Editorial line** (versioned text the owner edits): who Gabee is, audience
(parents, schools, partners), tone, do / don't, vocabulary, the product facts the
agents may state (modules, ages, languages, free tier, paid offer once it exists —
a structured "product facts" block the owner keeps current). Agents may only state
product facts from this block.

**Platform profile** — per platform (LinkedIn, TikTok at launch): objective on that
platform, tone notes, format rules (length limits, hashtag policy, link placement,
emoji policy), default media format (16:9, 1:1, 9:16).

**Week** — `starts_on` (Monday), status
`proposing → proposals_ready → direction_set → titles_ready → validated` (+ `skipped`).
Holds the 3 **direction proposals** (title, rationale, evidence from last week,
sample angles), the **chosen direction** (proposal reference + owner's edited text),
optional **per-platform angle overrides** (free text handed to that platform's
writer; the daily topics stay shared), and the link to the objective.

**Slot** — one per day of a validated week: topic title, angle, format intent (`text`, `visual`, `gameplay_video`, `presentation_video`, `story`),
target platforms with a **language per platform** (`fr` | `en`; over the week each
platform must have at least 2 `en` posts — fewer only if the owner explicitly
overrides, which the UI flags), optional source references (for news / observances), status
`proposed → validated → drafting → drafted → done | skipped`.

**Draft** — one per (slot, platform), written in that platform's language for the day: body text, hashtags, tracked link, media
attachments, status `generating → ready → approved → published` (+ `failed`,
`stale`). Every regeneration or human edit creates a **draft version** (who/what
produced it, which agent version, the owner's edit diff). Approval pins a version.

**Publication** — recorded when the owner marks a draft published: platform post URL,
published-at, optional feedback (free text + a 1–5 rating). This is the evidence the
Strategist and Writers learn from.

**Media asset** — a file in the media library: kind (image / video), dimensions,
duration, aspect, language, tags (module, level, theme), origin (`upload`,
`imported`, later `generated` / `captured`), checksum, and a **publication
clearance** (`cleared` / `not_cleared` + note). Only cleared assets can be attached
by the Art director or approved on a draft. Assets reach production by **upload
through the admin** (the `docs/Comm/` folder exists only on the owner's machine);
anything imported from `docs/Comm/` starts `not_cleared` — its README lists known
problems (invented maze, forced keyboard sentences, hidden levels, "50 leçons" test
data, `_archive/`).

**Media storage — decided by the owner: Cloudflare R2.** Every media file (uploads
now, generated and captured media from Phase 3) lives in a **private** R2 bucket,
behind a storage port (Lehno pattern: `stockage.port.ts` + `r2.adapter.ts`, with an
in-memory adapter for tests). Nothing is stored on the VPS disk or in the DB.
The agent never posts: the owner **downloads** each file through a link, checks it
locally, then uploads it to each social platform. So:

- **Downloads** use short-lived **presigned GET URLs** generated on demand when the
  owner clicks "Télécharger" in the admin (fresh link each time, e.g. 15 min expiry,
  `Content-Disposition: attachment` with a readable file name such as
  `2026-10-29-linkedin-gabee-code.mp4`). Emails link to the admin screen, never to a
  raw presigned URL, so no long-lived bearer link sits in an inbox.
- **Uploads** go straight from the browser to R2 with a **presigned PUT** (large
  videos never transit through the Next.js server), then the app verifies the object
  (size, MIME by content sniffing, checksum) before registering the asset.
- Keys in env only (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`) — real values in the gitignored `.env.production`, empty placeholders
  in `.env.production.example`. The bucket and an API token scoped to that bucket
  must exist **before the Oct 27 deploy** (owner action).

**Job run** — every scheduled job execution: job key, period key (e.g.
`week:2026-10-26`, `day:2026-10-27`), status, started/finished, error, attempts.
Unique on (job key, period key) → idempotent.

**Notification** — every email/in-app notification sent: kind, period key,
recipients, provider message id, status. Unique on (kind, period key, recipient).

## TikTok

Every TikTok post is a **vertical video** (9:16); text alone is not a post. Phase 1
generates no video, so TikTok works in two steps (owner's choice):

1. **From the first post** — the TikTok writer picks a **cleared vertical video** from
   the library. When none fits the day's topic, it delivers a **filming plan** instead:
   the hook for the first 3 seconds, the on-screen text, a short shot list the owner
   can film on a phone in a few minutes (e.g. the app screen while playing), the
   caption and hashtags. The owner films, uploads the video to the library (R2),
   clears it, and approves the draft. The card shows clearly which mode the draft is
   in.
2. **Right after launch** — a slice of Phase 3 is pulled forward: **template videos**
   (like the launch announcement, scripted by the AI) and **gameplay captures**
   generated automatically for TikTok drafts. The filming plan stays as the fallback.

Links in TikTok captions are not clickable, so per-post attribution is not possible
on TikTok: the profile's **link in bio** carries `utm_source=tiktok&utm_medium=social
&utm_content=bio`, and TikTok visits/sign-ups are measured per platform and per week,
not per post. TikTok business accounts only have the commercial music library; the
writer never suggests trending sounds.

## Agents

An agent is a **role stored in Gabee**, not a long-running process. Its behaviour is
stable because everything that defines it is persisted and versioned.

| Agent | Produces | Reads ("memory" assembled at each run) |
|---|---|---|
| **Strategist** | 3 direction proposals; then the week's titles for the chosen direction | objective · editorial line · platform profiles · last 4 weeks of slots, publications and owner feedback · internal metrics summary · upcoming observances/events (web search) |
| **Writer — LinkedIn** | the LinkedIn draft for a slot | editorial line · LinkedIn profile · week direction · slot · last 10 LinkedIn publications + feedback · owner edits on past drafts (diffs) |
| **Writer — TikTok** | the TikTok draft: caption, hashtags, on-screen text, cover choice; when no suitable vertical video is cleared, a **filming plan** (see below) | same, TikTok · cleared vertical videos in the library |
| **Art director** | media choice per draft from the library + a written visual brief (used by Phase 3 to generate media) | slot · draft text · media library index · platform format |
| **Analyst** | the narrative part of the Sunday report | internal metrics (existing digest services) · publication log · feedback |

(Phase 4 adds a **Scriptwriter**.)

**Agent harness** — each agent has:

- **Versioned instructions** (system prompt + structured settings), immutable once
  published; editing creates a new draft version. Publishing a version requires a
  **trial run** against a saved sample input, shown side by side with the current
  version's output (Lehno "Studio" pattern).
- **Structured output** validated against a zod schema in `@gabee/types`. Invalid
  output is a failure (logged, retried once, then surfaced), never silently patched.
- **A model chain** (see AI layer) and a per-run token cap.
- **Run journal**: inputs (or a hash + reference when large), output, version,
  model used, tokens, cost, latency, outcome, error code.
- **A feedback loop**: the owner's edits (diff between generated and approved text)
  and published-post feedback are fed back into the agent's memory on later runs.

**Third-party content**: a post relaying news or an article summarises it in its own
words and links to the source; it never copies the article's text or images.

**Untrusted input**: web-search results, news content and pasted text are data.
They are passed to the model in clearly delimited blocks, never as instructions; any
factual claim drawn from them carries its source URL, shown to the owner on review.

## AI layer

Generalise the AI access into a **task router**, modelled on Lehno
(`lehno/apps/api/src/ia/routeur.service.ts`), living next to the existing seam in
`apps/web/src/lib/server/ai/`:

- **Tasks**: `content_strategy`, `content_titles`, `post_linkedin`, `post_tiktok`
  (later `post_x`, `post_facebook`), `art_direction`, `report_narrative`, `stats_from_screenshot`
  (Phase 2), `image_generation`, `video_generation` (Phase 3). Each task declares the
  **capability** it needs (`text`, `vision`, `image`, `video`) so an incapable model
  cannot be routed to it.
- **Model catalogue** in the DB: provider, model id, capabilities, input/output price
  per million tokens (or per image / per second for media), enabled flag, health.
  Seeded from code, editable by super-admins in the admin. **No price or model id
  hardcoded in business code.**
- **Per-task ranked chains** in the DB (e.g. strategy: Claude Opus → Claude Sonnet;
  posts: Claude Sonnet → backup). Defaults use current Anthropic models; the builder
  picks exact ids from the Anthropic docs at implementation time.
- **Adapters** built only when their key is present (`ANTHROPIC_API_KEY` now; a backup
  provider key later, e.g. OpenAI, DeepSeek or xAI as in Lehno). A missing key
  disables that adapter visibly in the admin, it does not crash the app.
- **Fallback rules**: fall back to the next model on provider failure (5xx, timeout,
  rate limit, overload); **never** on a refusal or invalid-request error. A circuit
  breaker marks a model unhealthy after N consecutive failures for M minutes.
- **Metering**: extend `ai_usage` (or add a sibling table) with `task`, `origin`
  (`scheduled_job` / `user_action` / `trial`), `agent_run_id`, `latency_ms`,
  `error_code`, `status`. Cost is computed from catalogue prices at call time and
  stored on the row. The existing AI-usage admin page shows the new rows.
- **Budget**: a monthly budget in studio settings, covering **Communication tasks
  only** (filtered by the new task/origin columns; question authoring is separate). Crossing the alert threshold emails
  the owner; reaching the budget stops scheduled generations (manual regeneration
  still allowed for super-admins) and says so plainly in the UI.

## Scheduling

The `cron-digest` sidecar today pokes three endpoints once a day. Phase 1 adds a
**tick**: the sidecar also calls `POST /api/cron/content-tick` every 10 minutes
(same `Authorization: Bearer CRON_SECRET` gate, fail-closed). The tick runs a small
dispatcher that, for the current studio-local time, decides which jobs are due and
runs each at most once per period key (Job run uniqueness). Jobs:

`week.propose` (Sun 06:00) · `week.email` (Sun 07:00) · `week.remind` (Sun 15:00,
20:00) · `day.generate` (04:00, or immediately when the week is validated late) ·
`day.notify` (05:00) · `day.remind` (09:00, 13:00) · `budget.check` (hourly).

A due job that failed is retried on later ticks with backoff, up to a cap, then
alerted. A job missed while the app was down runs on the first tick after recovery if
still meaningful (e.g. a late 05:00 notification still goes out at 06:10; a Sunday
15:00 reminder is skipped if the 20:00 one is due).

## Notifications

- **Email** through the existing `sendEmail()` (Mailgun / Resend). Recipients from
  studio settings (default: `ADMIN_DIGEST_TO`). Bilingual subject/body in the
  owner's admin language. Each email has one clear call-to-action link to the exact
  screen (`ADMIN_APP_URL`).
- **In-admin**: a badge on the Communication nav item counting items that need the
  owner (proposals to choose, titles to validate, drafts to approve, posts to mark
  published).
- The Sunday email **replaces nothing**: the existing weekly admin digest keeps its
  job. The builder decides whether to merge both into one Sunday email (preferred if
  it stays readable) or send the content email separately.

## Admin UX

New nav item **"Communication"** (the existing "Contenu" item is the question-content
studio; reusing the name would confuse). Screens:

1. **Aujourd'hui** (landing screen of the section and of the 05:00 email): today's
   slot and one card per platform. Each card: rendered preview close to how the post
   will look, media thumbnail, and actions **Copier le texte · Télécharger le média ·
   Modifier · Régénérer · Valider**. Once approved: **Marquer comme publié** (post URL,
   optional rating + comment). Yesterday's unfinished items appear on top.
2. **Semaine**: step 1 — the 3 direction cards + a free-text refinement box + optional
   per-platform angle → "Arrêter cette direction". Step 2 — the 7 day lines (topic,
   format, and one FR/EN chip per platform, with a per-platform count of English
   posts for the week) with **Valider · Modifier · Régénérer** per line
   → "Valider la semaine". A **"Lancer la semaine maintenant"** action starts the loop
   outside the Sunday schedule (first week, or after a missed Sunday).
3. **Historique**: past weeks, posts and their publication records, filterable by
   platform and direction.
4. **Réglages** (super-admin): objective of the month, editorial line, product facts,
   platform profiles, schedule & timezone, recipients, budget, **agents** (versions,
   trial, publish), **models & prices** (catalogue and chains), media library.

The mockup reviewed with the owner (Semaine / Aujourd'hui / Stats) is the reference
for screens 1–2; the Stats screen belongs to Phase 2.

Design rules: reuse the admin shell and components; **phone and computer** layouts for
Aujourd'hui and Semaine (cards stack on a phone; actions stay within thumb reach); one primary action per screen;
designed empty, loading and error states for every list and generation; long AI
operations show progress and never block the page; every destructive action
(regenerate over a human edit, skip a day) asks for confirmation.

## Security

- Access: `requireAdmin` to view and act on weeks/drafts; `requireSuperAdmin` for
  settings, agents, models, prices, budget. Every mutation writes an `AuditLog` row.
- Cron endpoint: bearer `CRON_SECRET`, fail-closed, not exposed beyond the existing
  host gating.
- Secrets only in env (`ANTHROPIC_API_KEY`, future provider keys) — never in the DB,
  never in prompts, never in logs, never in `.env*.example` beyond empty placeholders.
- Prompt injection: untrusted content (web results, news, pasted text, uploaded file
  names) is delimited and treated as data; agents have no tools that write anything —
  only the app persists outputs after schema validation.
- Media: private R2 bucket; access only through short-lived presigned URLs minted for
  an authenticated admin. Allow-listed MIME types (png, jpg, webp, mp4), size caps,
  content sniffing after upload, random object keys, `Content-Disposition: attachment`,
  no inline SVG/HTML. R2 token scoped to the single bucket.
- Tracked links point only to Gabee domains (allow-list), so a generated post cannot
  smuggle an arbitrary URL.
- Generated text is rendered as text (escaped), never as HTML.

## Errors and observability

- No `catch` that swallows: every caught error is either rethrown, or recorded
  (Job run / agent run / notification row with error code) **and** reported to Sentry.
- A failed generation leaves a visible `failed` state with the reason in plain words
  and a **Réessayer** action.
- A job that exhausts its retries emails the owner and shows a banner in the section.
- Structured logs (existing logger) for every job and AI call, correlated by a run id.
- The existing Ops pages show the new data: AI usage per task/agent, job runs, errors.

## Testing

Match the repo's established layers (see `project_test_strategy`):

- **Unit**: state machines (week, slot, draft), the dispatcher's due-job logic across
  timezones and DST-free/edge times, reminder rules, prompt/memory assembly, output
  schema validation, router fallback vs refusal, circuit breaker, cost computation,
  link builder (UTM, domain allow-list), upload validation.
- **Integration** (Postgres test DB, fake AI adapter — no network): full week loop
  from `week.propose` to a published draft; idempotency of every job; late
  validation path; stale drafts; budget stop; error paths recording + alerting.
- **E2E** (admin Playwright project): choose a direction, validate titles, approve a
  draft, copy/download, mark published; reminder badge counts.
- **Contract**: every agent's output schema has fixtures for valid and invalid output.
- Coverage ratchets stay green (`c8` thresholds are not lowered).

## Forward hooks (so Phases 2–4 plug in)

- Tracked links are plain URLs to Gabee domains with UTM parameters (no short-link
  redirect service in Phase 1). They carry `utm_source` (platform), `utm_medium=social`,
  `utm_campaign` (week slug), `utm_content` (draft id), captured from day one by the
  measurement prerequisite.
- `Publication` has room for platform stats (Phase 2 adds the rows).
- `Media asset.origin` already lists `generated` and `captured`; the Art director's
  visual brief is stored so Phase 3 can generate from it.
- The task catalogue already has `image_generation`, `video_generation`,
  `stats_from_screenshot` (disabled until their phase).
- Slot format `story` exists; Phase 4 routes it to the Scriptwriter.

## Deadline and delivery order

- **In production by Monday 2026-10-27; first post from the loop on Wednesday
  2026-10-29.** The first week is started with "Lancer la semaine maintenant" on
  Oct 27–28 (the Sunday schedule only applies from Sunday Nov 2).
- To hold that date, Phase 1 ships in two steps, each production-quality (tests,
  logging, security and clean UX are not deferred in either):
  - **1a — by Oct 27, the loop end to end**: data model; task router with the
    Anthropic adapter and model catalogue + prices **stored in the DB** (seeded, read
    by the router and metering); the six agents with their instructions stored and
    versioned in the DB (seeded); **visit + source measurement and sign-up
    attribution**; scheduler tick + jobs; emails, reminders, badge;
    Aujourd'hui and Semaine screens; mark-published + feedback; media library with
    upload and clearance; tracked links; budget alert email.
  - **1b — right after**: Réglages screens (objective, editorial line, platform
    profiles, schedule, recipients), agent version editing with trial-before-publish,
    models & prices editing, backup-provider adapter and circuit breaker, budget hard
    stop, Historique screen.
  - Until 1b ships, objective, editorial line and platform profiles are seeded and
    changed by a super-admin through a minimal form or a seed update — never by
    editing code.
- Risk: 1a is about a week of work for a large surface. If something has to slip, it
  is 1b (then the in-admin badge — email alone is enough at first), never quality
  inside 1a and never measurement.
- Owner actions before go-live: create the R2 bucket + scoped token; have the
  privacy-policy wording reviewed; upload and clear a few media in the library.
- Staging: the `cron-digest` sidecar does not run on staging; the tick endpoint and
  "Lancer la semaine maintenant" let the loop be exercised there by hand.

## Decided by the owner

- Runs in production, inside Gabee, on the AI APIs (Anthropic first, backup later).
- Weekly loop: Sunday report + plan email; owner picks/refines a direction, then
  validates titles; daily drafts at 05:00; manual posting; mark published with
  feedback; reminders when late.
- One direction per week across platforms by default, per-platform override possible.
- Same daily topic, different post per platform, each with its own objective.
- Platforms at launch: **LinkedIn and TikTok**; X and Facebook later.
- TikTok: filming plan from day one when no video fits, and automatic video
  generation pulled forward to right after launch (see "TikTok").
- Media (uploaded, and later generated) are stored on **Cloudflare R2**; the owner gets
  download links, checks files locally, then uploads them to each platform.
- Language: French by default; each platform gets at least 2 English posts per week,
  on days that may differ between platforms.
- A per-platform override changes the angle only, not the daily topic.
- In production by 2026-10-27, first post from the loop on 2026-10-29.
- Media mixes real gameplay videos, generated communication images, presentation
  videos, and mascot-led story videos (no children depicted; Gabee + invented cast).
- One agent per creative role, with consistent context over the solution's lifetime.
- Objectives: daily activity, sign-ups, and paying users (paid offer before end of
  October 2026).
- Quality bar: the anti-goals above.

## Calls made in this spec (owner to check)

- Section named **"Communication"**, separate from the existing "Contenu".
- Studio timezone default **Africa/Douala**; schedule hours as listed, all settings.
- Drafts generated at **04:00**, notification at **05:00**; reminders 09:00/13:00
  (daily) and 15:00/20:00 (Sunday).
- Scheduling via a **10-minute tick** on the existing sidecar, not new infrastructure.
- Phase 1 media come from a **library** (uploads + existing `docs/Comm` assets);
  generation is Phase 3.
- **One active objective per month.**
- Email + in-admin badge for notifications (no push/SMS/WhatsApp in Phase 1).
- Existing question-authoring AI is **not** migrated to the router in Phase 1.
- Media carry a **publication clearance**; imported `docs/Comm` assets start not
  cleared; assets reach production by admin upload.
- The AI budget covers **Communication only**.
- Plain UTM links, no short-link service.
- Phase 1 split into **1a (by Oct 27)** and **1b (right after)** as listed above.

## Left to the builder

- Final Prisma model/field names; R2 bucket lifecycle/retention and whether
  `docs/backups.md` should cover the bucket.
- Exact default model ids/chains (from current Anthropic docs) and the backup provider.
- Whether the Sunday content email merges with the existing weekly admin digest.
- How observances/events are sourced (web search tool vs a curated calendar table,
  or both).
- Component breakdown within the existing admin design system.
