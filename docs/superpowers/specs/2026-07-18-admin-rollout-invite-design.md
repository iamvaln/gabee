# Admin "Rollout & Invite" — design spec

**Date:** 2026-07-18
**Status:** Approved for planning
**Branch:** `feat/admin-rollout-invite` (off `develop`)

## Problem

We dark-launch features to a small cohort of parents by flipping per-parent
feature-flag overrides (deliver-but-hide; see `project_content_rollout`). Today an
admin does this one flag / one parent at a time on the Flags page, and there is **no
way to tell parents** a feature was turned on for them. We want to (a) enable one or
more features for a selected set of parents in one action, and (b) send those parents
a warm, bilingual (FR + EN) invitation email describing exactly what was unlocked —
with copy pre-filled per feature but editable each time.

**Non-goal / already settled:** the *content* is already published on prod (code
bundle v7, all rows `confirmed`). The only gate is the feature flags. This feature
does **not** touch content status, `publish.mts`, or seeding.

## Scope

In scope:
- Per-flag **parent-facing announcement copy** (FR + EN), separate from the technical
  admin `description`.
- A **bulk rollout** admin flow: pick features → pick parents → preview/edit the
  assembled bilingual email → one submit enables the overrides and (optionally) sends.
- **Per-parent notification tracking** (`notifiedAt` on the override), surfaced in the
  admin so an "enabled but not yet notified" cohort is visible and actionable, and so
  prompted-vs-self-discovery can be analysed later.
- Reuse of existing email + flag-override infrastructure.

Out of scope (YAGNI): per-child name personalization (overrides are per-family, so
copy stays "votre enfant / your child"); scheduling / drip; open/click tracking;
content publishing.

## Approach

Three units, each independently understandable and testable.

### 1. Registry — parent-facing announcement copy

Add to `packages/types/src/flags.ts`:

```ts
export type FlagAnnouncement = {
  fr: { title: string; body: string };
  en: { title: string; body: string };
};
// Only flags present here are "announceable" (offered in the rollout UI).
export const FLAG_ANNOUNCEMENTS: Partial<Record<FlagKey, FlagAnnouncement>> = {
  code_draw_l4: { /* Drawing with code */ },
  code_l6:      { /* Bug hunting / Debugging */ },
  kid_ambient_music: { /* background music */ },
};
export function announceableFlags(): FlagKey[]; // keys of FLAG_ANNOUNCEMENTS
```

- Static, version-controlled, type-checked (a typo'd key is a compile error, matching
  the existing flag-registry convention).
- `body` is a short plain-text/markdown-ish paragraph. The title carries the emoji.
- This is the **pre-fill source** only. The admin edits the assembled email before
  sending; we do not persist edited copy (each rollout is composed fresh).

Seed copy for the three current dark flags is in the Appendix. Debugging copy MUST
state it appears at **level 6 of the Maze and Actions worlds** (not Draw) and is
sequentially gated.

### 2. Email assembly — pure function

New module `apps/web/src/lib/server/rollout-email.ts`:

```ts
type Assembled = { subject: string; text: string; html: string };
function assembleRolloutEmail(flags: FlagKey[]): Assembled;
```

- Fixed bilingual intro ("early-access cohort" framing) + one block per selected flag
  (FR section, then a divider, then EN section) + fixed bilingual outro ("reply to
  this email with feedback").
- Deterministic order = `FLAG_KEYS` order, filtered to the selected + announceable set.
- Produces both `text` and a simple inline-styled `html`. `replyTo` is set by the
  endpoint to the support address (`EMAIL_REPLY_TO` env, fallback `EMAIL_FROM`).
- `{ParentName}` always resolves — parent accounts carry a name (confirmed 2026-07-18).
  The greeting uses it directly; keep a plain "Bonjour," / "Hi," fallback only for the
  defensive empty-string case.
- Pure and dependency-free → unit-testable without a DB or network.

### 3. Backend endpoint + admin UI

**Endpoint:** `POST /api/admin/flags/rollout` — **super_admin only** (matches the
existing override-write authz in `flags/[key]/overrides`).

Request (Zod, added to `flags.ts`):
```ts
{ flags: FlagKey[];        // 1..n announceable flags
  emails: string[];        // 1..n parent emails (validated)
  enable: boolean;         // default true — set overrides ON
  send: boolean;           // default true — send the email
  subject?: string;        // optional edited overrides of the assembled copy
  text?: string; html?: string;
}
```

Behavior, per parent × flag:
1. If `enable`: `setFlagOverride({ key, email, enabled: true })` via the existing
   service (upsert → idempotent; already audited as `flag.override_set`). Does **not**
   touch `notifiedAt` — silent activation leaves the parent "not yet notified."
2. If `send`: `sendEmail({ to: email, subject, text, html, replyTo })` via the existing
   `lib/server/email.ts` — **one message per parent** (never a shared To/BCC list, so
   no recipient addresses leak between families).
3. On a **successful** send, stamp `notifiedAt = now` on each `(flag, parent)` override
   included in that email. This is the durable "was this parent notified?" signal.
4. Collect a per-parent result `{ email, enabled, emailSent, notifiedAt, error? }`.

- **Enable and notify are decoupled** (both toggles independent, both default on):
  `enable=true, send=false` → override ON, `notifiedAt` stays null (silent rollout).
  `enable=false, send=true` → stamp `notifiedAt` on existing overrides (notify a cohort
  activated earlier); a selected parent with **no** override for that flag is reported as
  an error (`no_override_to_notify`) rather than silently emailed — notification status
  only means something relative to a rollout.
- Overrides are written **before** send; a send failure does not roll back the enable and
  does not set `notifiedAt` (enabling succeeded — the email is a best-effort
  notification). Failures are reported, not thrown.
- **Re-send** overwrites `notifiedAt` with the latest send time (re-notifies are rare;
  last-sent is sufficient for the analysis).
- Emit one audit event `flag.rollout_notify` summarizing `{ flags, parentCount, sent,
  failed }` alongside the per-override audits.
- Sends run with small bounded concurrency (respect provider limits — Resend free tier
  is 100/day; log if the cohort exceeds a safety threshold rather than silently
  truncating).

Response: `{ results: PerParentResult[], summary: { enabled, sent, failed } }`.

**UI:** new route `apps/web/src/app/admin/rollout/` (`page.tsx` + `RolloutClient.tsx`),
linked from the Flags page and admin nav. Steps on one screen:
1. **Features** — checkboxes over `announceableFlags()`, each showing the parent-facing
   FR/EN title (not the technical description).
2. **Cohort** — multi-select over the parents roster, **annotated per parent with their
   status for the selected feature(s)**: `not rolled out` · `enabled · not notified` ·
   `notified {date}`. A quick filter **"enabled but not yet notified"** pre-selects
   exactly the catch-up cohort (the primary "enable now, email later" workflow).
3. **Preview & edit** — the bilingual subject + body auto-assemble from the selected
   features and are editable. Live summary: "Enable N feature(s) for M parent(s)."
4. **Options** — "Enable overrides" (default on) and "Also send invite email" (default
   on) toggles. Unchecking send = silent enable; unchecking enable = notify-only.
5. **Submit** → calls the endpoint → **result summary**: "M enabled · X sent · Y
   failed", failures listed with their error.

**Flags page (existing overrides list):** the per-parent overrides list under each flag
card gains a **Notified** indicator per row — `notified {date}` or `not notified` — so
the "was this parent told?" answer is visible exactly where the rollout is managed, not
only on the rollout screen.

**Schema / contract change:** add `notifiedAt DateTime?` to the flag-override model
(Prisma migration — a nullable column, no backfill; existing overrides read as "not
notified"). Extend `FlagOverrideRowSchema` in `flags.ts` with `notified_at: string |
null`, surfaced by `GET /api/admin/flags/[key]/overrides` and the parents endpoint used
by the rollout picker.

## Data flow

```
Admin UI (RolloutClient)
  → POST /api/admin/flags/rollout { flags, emails, enable, send, [edited copy] }
      → for each email:
          setFlagOverride(flag, email, true)          [existing service, audited]
          sendEmail(assembled | edited copy)          [existing email.ts]
          on send OK: stamp override.notifiedAt = now  [new]
      → writeAudit('flag.rollout_notify', summary)
      → { results, summary }
  → render per-parent summary
Kid app: next flags fetch returns the override → level/world tile appears.
```

### Notification status & analysis

`notifiedAt` on the override turns "rolled out to" into two observable cohorts for any
feature:
- **Prompted** — override ON **and** `notifiedAt` set (we emailed them).
- **Self-discovery** — override ON **and** `notifiedAt` null (they got the feature
  silently; any engagement is unprompted).

Comparing engagement (existing session/progress data) against `notifiedAt` — did the kid
play the new level, and before or after the email — is the behavioural question this
enables. That analysis query is **out of scope** for this build; the deliverable is the
durable `notifiedAt` signal that makes it answerable.

## Error handling

- **Not super_admin** → 403 (shared authz helper).
- **Empty flags or emails** → 400 (Zod).
- **Non-announceable flag key** → 400 (must be in `FLAG_ANNOUNCEMENTS`).
- **Unknown / malformed email** → skipped, reported in `results[].error`; the rest
  proceed.
- **Email provider failure for one parent** → that parent's `emailSent=false` +
  `error`; enable already stands; `notifiedAt` is **not** stamped; others continue.
- **`send=true` for a parent with no override for that flag** → reported as
  `no_override_to_notify` (notification status is only meaningful relative to a rollout).
- **Partial failure overall** → HTTP 200 with a mixed `results` array (this is a batch;
  the summary carries the failure count). Total failure of the whole request (auth,
  validation) → non-200.

## Testing

Following the established layer conventions (`project_test_strategy`):
- **Unit** (`packages/types` node:test via tsx — NOT Vitest, per `feedback_test_runner`):
  `FLAG_ANNOUNCEMENTS` shape + `announceableFlags()`.
- **Unit** (web): `assembleRolloutEmail` — single-flag vs multi-flag body, FR+EN both
  present, deterministic order, edited-copy override path.
- **Integration** (web): `POST /api/admin/flags/rollout` — super_admin gate (403 for
  plain admin), enable path writes overrides + `flag.rollout_notify` audit, send path
  invokes the email seam, partial-failure reporting. Assert the notify semantics:
  `enable`-only leaves `notifiedAt` **null**; a successful send **stamps** it; a send
  failure leaves it null; `send` to a parent with no override → `no_override_to_notify`.
  Use the **noop email provider** seam (set `EMAIL_PROVIDER=noop`) so no network —
  mirrors the AI-provider seam pattern.
- **E2E** (optional, admin French per `admin-e2e-french`): select a feature + a parent,
  submit, assert the summary. Defer if it strains the CI budget.

## Rollout / operational notes

- No content or migration changes. Ship via normal gitflow (PR → `develop`), release
  to prod when cut. Once deployed, use the new screen to release the dark features to
  the real cohort.
- `EMAIL_REPLY_TO` (new, optional) — document in `.env.production.example` per
  `feedback_secrets_in_env_example`; falls back to `EMAIL_FROM` if unset.

## Appendix — seed announcement copy (parent-facing, FR + EN)

**Fixed intro (FR):** "Bonjour {ParentName}, vous faites partie d'un petit groupe de
familles que nous invitons à découvrir en avant-première les toutes dernières
nouveautés de Gabee — avant tout le monde. Voici ce qui vient d'être activé sur le
compte de votre enfant :"

**Fixed intro (EN):** "Hi {ParentName}, you're part of a small group of families we're
inviting to try Gabee's latest features before anyone else. Here's what we've just
switched on for your child's account:"

**`code_draw_l4` — 🎨 Dessiner avec le code / Drawing with code**
- FR: Votre enfant peut désormais dessiner des images en programmant : en combinant des
  boucles et des conditions, il guide un crayon pour tracer des motifs. À retrouver dans
  le monde « Dessin » du module Code.
- EN: Your child can now draw pictures by coding: by combining loops and conditions, they
  guide a pen to trace patterns. Find it in the "Draw" world of the Code module.

**`code_l6` — 🐞 Chasser les bugs / Bug hunting (Debugging)**
- FR: Le débogage n'est pas un monde à part : c'est une nouvelle sorte d'exercice au
  niveau 6 des mondes Parcours et Actions. Votre enfant reçoit un programme déjà écrit
  mais qui bug, et doit trouver et corriger l'erreur. Pour l'essayer : Code → Parcours
  (ou Actions) → niveau 6 · Débogage. Les niveaux se débloquent dans l'ordre.
- EN: Debugging isn't a separate world — it's a new type of exercise at level 6 of the
  Maze and Actions worlds. Your child gets a program that's already written but broken,
  and has to find and fix the mistake. To try it: Code → Maze (or Actions) → level 6 ·
  Debugging. Levels unlock in order.

**`kid_ambient_music` — 🎵 Une petite musique d'ambiance / A little background music**
- FR: Gabee se fait plus douillet : une musique de fond apaisante accompagne désormais
  les écrans d'accueil et de navigation. Elle se désactive à tout moment dans les Réglages.
- EN: Gabee just got cozier: a gentle background soundtrack now plays on the home and menu
  screens. You can turn it off anytime in Settings.

**Fixed outro (both):** "Comme il s'agit d'un aperçu, votre avis compte énormément —
répondez simplement à cet e-mail. / Because this is an early preview, your feedback means
the world to us — just reply to this email." — L'équipe Gabee / The Gabee Team.
