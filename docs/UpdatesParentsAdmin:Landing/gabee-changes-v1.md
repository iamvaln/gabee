# Gabee — Consolidated Changes (v1, 30 May 2026)

## Purpose of this file

Development on Gabee (kid app, parent app, admin back office, product foundations) has already started. The canonical specs are **not being rewritten in place** for the work already underway. This file is the **single source of truth for what must change** in the in-progress codebase versus what was originally specified.

The **landing surface** (`gabee.app`) is NOT yet started — its spec (`gabee-landing-spec.md`) has been updated in place and is to be followed as-is. This file only summarises the landing-side changes for traceability; the spec is the dev reference.

For everything else (kid app, parent app, admin, product spec), this file is the diff. Apply the changes here; do not rebuild from older spec versions.

## How to read each change

Every change below has:

- **WHAT** — what changes, semantically.
- **WHERE** — code location (module / file path / spec section).
- **DEV ACTION** — concrete steps.
- **SIZE** — `COSMETIC` (copy or visual only) · `SMALL` (one component / route) · `MEDIUM` (multiple components / routes) · `LARGE` (new feature, multiple surfaces, DB migration).
- **PRIORITY** — `P0` (blocking MVP launch) · `P1` (should ship with MVP) · `P2` (post-MVP).

---

## Work by surface

For dev planning. Each surface owns a slice of the changes below:

| Surface | Changes that touch it |
|---|---|
| **Backend / shared** | §4 DB migration · §1.3 API endpoints (`/api/messages/*`) · §5 Event pipeline · `packages/types` schemas |
| **Parent app** (`apps/web`, `parents.gabee.app`) | §1.1 Messages section (3 screens M1/M2/M3) · §1.1 Top nav update (4 → 5 items + badge) · §2.1 Classification reframe + "Leave a word" affordance · §2.2 Email digest copy · Settings → Profile (`display_name_for_kids` field) |
| **Kid app** (`apps/kid`, `kids.gabee.app`) | §1.2 Message reception sync · §1.2 Bandeau component (end-of-lesson, persistent) · §1.2 Reader screen · §5 events (`parent_message_delivered_to_kid`, `parent_message_read`) |
| **Admin app** (`apps/web`, `admin.gabee.app`) | §1.5 Messages feature-health dashboard (metrics on volume, engagement, read latency, adoption). Counts and rates only — **never message content**. |
| **All UI surfaces** | §3 Brand positioning — string-level guidance (the contre-positioning language likely isn't in current code, so this is mostly a **rule for new copy** rather than a code sweep). |

---

## Table of contents

1. [NEW FEATURE — Parent → Kid Messages](#1-new-feature--parent--kid-messages) [LARGE · P0]
2. [Classification reframing](#2-classification-reframing) [SMALL · P0]
3. [Brand positioning shift](#3-brand-positioning-shift) [COSMETIC · P0]
4. [Data model changes (DB migration)](#4-data-model-changes-db-migration) [MEDIUM · P0]
5. [Event schema additions](#5-event-schema-additions) [SMALL · P0]

---

## 1. NEW FEATURE — Parent → Kid Messages

**SIZE**: LARGE — new entity, new parent-app section, new kid-app surface, new events, DB migration.

**SURFACE**: parent app · kid app · admin app · backend.

**PRIORITY**: P0 (ships with MVP, per product decision).

The parent can leave a short text message to any of their kids, from a dedicated **Messages** section in the parent app, at any time. The kid sees a discreet bandeau between two lessons during their next session, taps it to read, and continues playing.

This is a **first-class feature**, not just an add-on to classification. Full spec lives in `gabee-parent-spec.md §8` (kid-side details cross-referenced from `gabee-ux-spec.md`).

### 1.1 Parent app — new `Messages` section

**WHERE**: `apps/web` (Next.js parent surface, `parents.gabee.app` subdomain).

**Routes to add**:
- `/messages` — Messages list (M1)
- `/messages/new?to=<child_id>` — Compose modal (M2, can also be invoked inline from anywhere)
- `/messages/<message_id>` — Message detail (M3)

**Navigation update**:
- Top nav goes from 4 to **5 items**: `Home · Classification(N) · Kids · Messages(M) · Settings`
- Bottom tab bar at narrow widths matches (5 items, all should fit on standard mobile width).
- `(M)` badge on the Messages menu counts messages still **unread by the kid** (server-side count, updated on each read event).

**Screens** (full UI spec in `gabee-parent-spec.md §8.2, §8.6`):

| Screen | Behaviour |
|---|---|
| M1 — Messages list | Filter chips by kid (default All), big "+ New message" button, chronological list of all messages (newest first), each row shows kid avatar + name + preview + status + read timestamp |
| M2 — Compose | Modal (full-screen narrow, centred wide): kid picker (required), text field with 200-char cap and live counter, sender label preview ("Signé Papa — Changer ?"), Send (mint) / Cancel |
| M3 — Detail | Big message text, metadata (to/from/sent/read), Delete affordance only if status='unread' (with confirm dialog), no edit / no delete if already read |

**Entry points to M2 from elsewhere in the parent app**:
- From Classification flow end-of-flow thank-you screen (§6.2): "Leave them a word?" — pre-selects the kid just classified.
- From Kid detail screen (§7 K2): "+ Leave a message" button — pre-selects that kid.
- Both open M2 with the appropriate kid pre-filled; on send, the user lands in M1.

**State management**:
- Optimistic send (message appears immediately in M1 as Unread, modal closes; on server confirmation, no UI change; on server failure, revert with error toast).
- M1 refreshes on focus + on websocket / polling when read status changes.
- 200-char client-side validation, server-side double-check.

### 1.2 Kid app — message reception

**WHERE**: `apps/kid` (Vite PWA, `kids.gabee.app` subdomain).

**Sync mechanism**:
- On each session start, fetch any unread `KidMessage` rows where `to_child_id = current profile`.
- Cache locally (works offline; sync new messages when online).
- Maintain a local "pending queue" of unread message IDs for the current profile, sorted oldest-first.

**Bandeau component** (new):
- Appears at the **end of every lesson** (between lessons, never mid-question) if the pending queue is non-empty.
- Position: bottom of viewport, full-width, ~80px tall.
- Content: small mascot icon (idle expression) + text *« <DisplayName> t'a laissé un mot 💛 »* (or EN equivalent) + small "Tap to read" hint.
- **Sound cue**: soft "ding" plays once on appearance (consistent with existing correct-answer audio identity).
- **Persistence**: if the kid dismisses the bandeau (or it scrolls off) without tapping it, it MUST reappear at the end of the next lesson. The bandeau is removed from queue only on tap.
- Animation: slide up from bottom on appearance, soft fade.

**Message reader screen** (new):
- Triggered by tapping the bandeau.
- Full-screen overlay over the current kid app context.
- Layout: mascot at top (celebrate expression), then the message text in large readable type (24pt+, line height generous), then a single mint "Continue" button.
- On tap Continue: fire `parent_message_read` event, mark message as read locally, return the kid exactly where they were (same lesson hub, same level, same module).
- If there are still messages in the queue, the bandeau will reappear at the end of the next lesson.

**Offline behaviour**:
- If the kid reads a message while offline, the read status is queued locally and synced when online.
- If the parent sends a new message while the kid is offline, the kid will see it on the next online session start.

### 1.3 API endpoints

**WHERE**: `apps/web` → API route handlers under `/api/messages/*` (called by both parent app and kid app via cross-origin with proper CORS).

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/messages` | POST | parent session | Create a message. Body: `{ to_child_id, text }`. Server validates: text length ≤ 200, parent has rights on this child. Returns the created `KidMessage`. |
| `/api/messages` | GET | parent session | List parent's sent messages. Query params: `?to=<child_id>` filter, pagination. |
| `/api/messages/<id>` | GET | parent session OR kid app token | Get one message (parent sees their own; kid app fetches via its child token). |
| `/api/messages/<id>` | DELETE | parent session | Soft-delete an unread message. 409 if already read. |
| `/api/messages/pending?child_id=<id>` | GET | kid app token | Kid app fetches unread messages for a child profile. Returns array of `KidMessage` (text included). |
| `/api/messages/<id>/read` | POST | kid app token | Mark a message as read. Sets `read_at = now()`, status = `read`. Fires `parent_message_read` event server-side. |

**Authorization rules**:
- POST/GET/DELETE require an active parent session AND the parent must have a `ParentChildLink` row for the recipient child.
- Kid app endpoints require a valid device-paired session whose profile ID matches the requested child.

### 1.4 Design guidance

These directions complement `gabee-design-spec.md` (which holds the tokens, mascot expressions, motion specs). They are concrete enough that a designer / agent can build the screens without further consultation.

#### Parent app — Messages section (mint surface)

**Voice & tone**
- Warm, brief, never instructive. The parent already knows what messages are.
- Empty states should feel inviting, never empty-and-scolding. Example: *« Aucun message pour l'instant. Écris-leur un mot ! »* — not *« Vous n'avez envoyé aucun message. »*
- Confirmations short: *« Envoyé »* / *« Sent »*. No fanfare.

**M1 — Messages list**
- Top: filter chips by kid (avatar + name). Selected chip uses mint fill, others ghost (border + mint text).
- Primary CTA **+ New message** — large, mint pill button, full-width on narrow / right-aligned on wide.
- List rows: avatar (left) · name + truncated preview (middle, two lines max) · status pill (right). Use 16px vertical padding per row, divider lines `--color-border`.
- Status pill colours: **Unread** = mint background, white text · **Read** = grey background, ink text with relative timestamp (*« Lu il y a 2h »*) · **Deleted before read** = grey outline only, italic.
- Empty state: mascot idle, mint accent, the welcoming line above + the CTA.

**M2 — Compose modal**
- Full-screen on narrow widths, centred modal (max-width 480px) on wide.
- Kid picker: row of avatar circles (48px), selected gets a mint ring (2px border). At least one required.
- Text field: 4-row textarea, generous padding, `--color-text` ink. Placeholder: *« Écris un mot à `<Name>`… »* / *"Write a word to `<Name>`…"*
- Live character counter, bottom-right of the textarea: grey at 0-150, ink-darkening at 150-180, **coral** at 180-200, **disabled-state** at 201+.
- "Signed: Papa — Changer ?" → small inline link below the textarea that opens the Settings → Profile shortcut.
- Two buttons: **Send** (mint, primary) + **Cancel** (ghost). Send disabled while text is empty or over-limit.
- On send: modal closes immediately (optimistic), toast bottom-centre *« Envoyé »*.

**M3 — Message detail**
- Centred reading column, max-width 560px.
- Big readable message body — 20-24pt, line-height 1.6, ink on `--surface`.
- Metadata block below the message: small grey labels (To / From / Sent / Read), monospace timestamps. Stacked vertically.
- Delete button (only if `status='unread'`): **mint outline**, NOT red. The delete is a soft retraction, not a destructive action. Confirm dialog: *« Le message n'a pas encore été lu par `<Name>`. Supprimer ? »* with **Garder** (default) and **Supprimer** options.

#### Kid app — message reception (honey surface)

**Bandeau component**
- Position: bottom of the viewport, full-width, ~80px tall.
- Background: very light mint (`#E8F8F4` or similar — soft, contrasts with the honey-themed kid surface), 16px corner radius on top corners only.
- Content: small mascot icon (idle expression, 32px) at left · message text *« Papa t'a laissé un mot 💛 »* in Mulish 600, 16pt · subtle "Tap to read" hint right-aligned in lighter text.
- Animation: slide up from below over 250ms ease-out on first appearance per lesson. No animation on persistent reappearances (just appear).
- Soft `ding` sound on first appearance (per lesson, not per persistence). Reuse the existing correct-answer audio sample or a tonally consistent variant.
- Tap target: the entire bandeau (not just the text).

**Reader screen**
- Full-screen overlay above the current kid context, fades in over 200ms.
- Background: `--surface` (warm off-white), no module color (the message is a moment outside the learning content).
- Mascot at top, **celebrate** expression, ~120px.
- Message body: **very large readable type**, 28-36pt depending on viewport, Mulish 600, ink, max-width 80% of viewport, line-height 1.5. A 6-year-old must be able to read it without straining.
- Below the message, a single **Continue** button — large mint pill, ~56px tall, easy thumb target. Label: *« Continuer »* / *"Continue"* — never *« Fermer »*.
- No "back" button, no header bar — minimal furniture.
- On tap Continue: fade out over 200ms, return to the exact lesson hub the kid came from.

**Voice for the bandeau & reader**
- Use the parent's `display_name_for_kids` exactly as the parent set it (no transformation).
- Heart emoji 💛 is the only emoji used; it ties the bandeau to the warm parent-child intent.
- If the kid has multiple unread messages from different parents, each gets its own bandeau in sequence (oldest first).

#### Cross-surface guidance

- **Never expose the kid to "Read at X" timestamps**: the kid doesn't need to know when they read it; the parent needs to know. Read state is a parent-side concept only.
- **Never show the kid pending counts** like "You have 2 unread messages." Show messages one at a time, naturally, between lessons. Counts are anxiety-inducing for a child this age.
- **No notifications when offline** — the kid sees the bandeau when their device is back online and a session resumes. No "you missed a message yesterday" framing.

### 1.5 Admin app — Messages feature-health dashboard

**WHERE**: admin back office, analytics module (extends `gabee-admin-spec.md §11`).

**Purpose**: track adoption + engagement of the Messages feature to know whether parents use it, whether kids read what they receive, and how the feature evolves over time. The admin needs this signal to decide whether to invest more in messaging, change the entry points, or adjust the kid-side surfacing.

**Strict rule — privacy boundary**: the admin sees **counts, rates, timestamps, IDs, derived distributions** — never message text. The `text` column of `kid_messages` is excluded from every admin query and every materialised aggregate. Enforce this at the data-access layer (e.g. a dedicated read role with no SELECT on `text`).

**Metrics to add** — organized as a "Messages" group within the analytics module, alongside the existing decision-grade tiles. All metrics are computed from the 4 events in §5 (no new tracking required).

#### Volume (rolling windows: last 7d, last 30d, all-time)
- **Messages sent** — count from `parent_message_sent`.
- **Messages delivered** — count from `parent_message_delivered_to_kid` (first bandeau appearance).
- **Messages read** — count from `parent_message_read`.
- **Messages deleted before read** — count from `parent_message_deleted_by_sender`.

#### Engagement
- **Read rate** = `read / delivered`. The single headline number — *« 87% des messages sont lus »* — answers "is this feature working?".
- **Median time-to-read** — delivery → read tap, in minutes. Tells whether kids read promptly or much later.
- **Time-to-read distribution** — histogram bucketed: `< 5 min · 5-30 min · 30 min - 2h · 2h - 24h · > 24h`. Shows the shape, not just the median.
- **Active senders** (per period) — distinct parents who sent ≥ 1 message.
- **Active recipients** (per period) — distinct kids who received ≥ 1 message.
- **Send frequency per active sender** — histogram of messages sent per active week per parent: `1 / 2-5 / 6-10 / 10+`. Distinguishes occasional vs heavy senders.

#### Funnel
- **Sent → Delivered → Read**, with conversion rates between each step. A drop between Sent and Delivered would flag a sync issue; a drop between Delivered and Read flags a kid-side UX issue (bandeau missed, ignored).

#### Adoption & retention
- **Adoption curve** — % of all parent accounts that have *ever* sent a message, week-over-week. Shows how fast the feature seeds.
- **Sender retention** — among parents who sent ≥ 1 message in week N, % who sent ≥ 1 in week N+1, N+2, N+3, N+4. Distinguishes "tried once" from "ongoing rhythm".
- **Classification-to-message coupling** — among parents who classified sessions in a given day, % who also sent a message that day. Answers whether the inline affordance in the classification flow (§2.1) is working.

#### Distributions only — no identities
- All metrics are aggregate or distribution-shape. No leaderboard with parent or kid names. The admin doesn't need to know *which* parent sends the most — only the shape of the population.
- If a future product question requires per-parent or per-kid drill-down, it gets re-evaluated against the privacy principle then.

**DEV ACTION**:
- Create materialised SQL views in Supabase for each metric category (refresh hourly is fine for MVP). Don't run heavy queries live against `kid_messages` on every dashboard load.
- Build a "Messages" tile group in the admin analytics module, with the Read Rate gauge prominent at the top and the rest in a scannable 2-column grid below.
- Surface the Funnel as a single horizontal sankey-like component (Sent → Delivered → Read), with drop-off percentages.
- The Adoption Curve and Sender Retention are line charts (week-on-week).
- Visual treatment: coral accents (admin surface color); the Read Rate headline uses the admin's primary tile style.

#### Design guidance — admin Messages dashboard
- The dashboard is read-only. No actions, no message inspection, no parent contact from this view. It exists to **inform decisions**, not to act on individuals.
- Empty state (no messages sent yet by anyone): *« La feature messages n'a pas encore été utilisée. »* with a small mascot idle — sober, not promotional.
- Date-range selector at the top of the tile group: `7d · 30d · 90d · All-time` (default `30d`).
- Each tile shows its headline metric large, the comparison vs previous period as a small percentage delta (green if up, ink if down for read-rate; just informational for volume metrics).

---

## 2. Classification reframing

**SIZE**: SMALL — text/copy changes + one new affordance in the existing classification flow.

**SURFACE**: parent app · email templates.

**PRIORITY**: P0 (ships with MVP).

The classification's *purpose framing* changes from "*the single signal that tells us if Gabee helps*" to "*your daily moment to stay close to your child's learning*". The mechanics (3 buttons: They asked / I suggested / Not sure) and the adherence metric derivation are unchanged.

### 2.1 Parent app — Classification flow

**WHERE**: `apps/web` → parent classification screens (current C1).

**DEV ACTION**:
- Remove any copy stating "this is how we know if the app is helping" / "single signal" / similar.
- Replace with framing oriented to the parent: "Stay close to your child's day" / "Two minutes to know what they did today."
- **NEW affordance**: on the C1 end-of-flow thank-you screen, add an action **"Leave `<Name>` a word for next time"** that opens the Compose Message modal (M2) pre-filled with the kid just classified. Skip = return to home.
- If the parent has multiple kids classified in this batch, the affordance lets them pick a kid (or all). See `gabee-parent-spec.md §6.2`.

**Design note** for the affordance:
- The thank-you screen keeps its existing celebrate-mascot moment; the affordance sits *below* the existing "All done" message, not in front of it.
- The action reads as an **invitation**, not a task. Wording like *« Et si tu lui laissais un mot ? »* (FR) / *"Want to leave them a word?"* (EN) — phrased as a question, not an imperative.
- Two buttons, equal weight: **Oui** (mint) opens M2 · **Plus tard** (ghost) closes the flow. Neither is the "primary" — the parent is not pressured.
- Multi-kid case: a small kid-avatar row above the buttons; tap an avatar to pre-select that recipient before Oui.

### 2.2 Email digest copy

**WHERE**: email template for the daily classification digest (`apps/web/emails/...`).

**DEV ACTION**:
- Rewrite subject + body to lead with "stay close" framing, not "help us know."
- Suggested subject: « Voici ce qu'`<kid>` a fait aujourd'hui » / "Here's what `<kid>` did today"
- Body: lists sessions + "Two minutes to stay close" + CTA to classify.
- Specific copy is open to the team; intent is: parent-centric, not team-centric.

### 2.3 Internal analytics — unchanged

- The adherence metric (self-initiated / parent-prompted ratio) is still derived from classifications and used in internal product analytics.
- No API or data model change here. Internal naming can stay (`initiation_label`, `child_initiated`, `prompted`, `unsure`).

---

## 3. Brand positioning shift

**SIZE**: COSMETIC — only text strings and brand-essence statements.

**SURFACE**: any UI / copy author (likely *no* existing-string sweep needed; this is a rule for new copy).

**PRIORITY**: P0 (consistent voice across surfaces).

The brand voice shifts away from contre-positioning ("not an attention casino") to positive positioning around "**a sharp mind, foundational + digital skills, in two languages.**"

The healthy-use *features* (daily cap, soft-limit, no streaks-as-pressure) remain — only their framing changes (described as positive product principles, not as "we're better than the casino").

### 3.1 Strings to change wherever they appear in code

**WHERE**: any UI string, marketing copy, in-app text, email copy.

**REMOVE** any of these phrases:
- "machine à attention" / "attention machine"
- "casino d'attention" / "attention casino"
- "pas une machine à attention" / "not an attention machine"
- "différent, c'est exprès" / "different on purpose"

**REPLACE** with positive equivalents:
- For the tagline: « Garder l'esprit vif. Construire les compétences qui comptent. » / "A sharp mind. The skills that matter."
- For the description: "un outil d'apprentissage pour les enfants de 6 à 8 ans : vocabulaire, calcul, logique du code, frappe au clavier — en français et en anglais."

### 3.2 Brand essence (internal docs)

The brand essence in `product-spec-v0.1.md §15` and `gabee-design-spec.md` is now:

> "A warm, calm, trustworthy robot bee — a friendly guide that helps a 6-8 year-old build foundational and digital skills, in two languages."

This is reference for any new copy generation.

### 3.3 Coding agent brief

`gabee-coding-agent-brief.md` has been updated to drop the contre-positioning line and reframe as: implement healthy-use mechanics (daily cap, soft limit, look-away breaks) + do not add engagement-maximizing patterns (no streak-guilt, no FOMO, no nagging). No casino reference.

---

## 4. Data model changes (DB migration)

**SIZE**: MEDIUM — new column, new table, new indexes.

**SURFACE**: backend (Supabase / Prisma) · `packages/types`.

**PRIORITY**: P0 (blocks the Messages feature shipping).

### 4.1 `ParentAccount`: new column `display_name_for_kids`

**Migration**:

```sql
ALTER TABLE parent_accounts
  ADD COLUMN display_name_for_kids VARCHAR(50) NOT NULL DEFAULT '';

-- Backfill: existing rows get first_name as default
UPDATE parent_accounts SET display_name_for_kids = first_name WHERE display_name_for_kids = '';
```

**Validation**: 1-50 chars, trimmed. Customisable in Settings → Profile.

### 4.2 New table `kid_messages`

**Migration**:

```sql
CREATE TABLE kid_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_parent_id UUID NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
  to_child_id   UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  text          VARCHAR(200) NOT NULL,
  status        VARCHAR(32) NOT NULL CHECK (status IN ('unread', 'read', 'deleted_by_sender')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at       TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_kid_messages_to_child_unread
  ON kid_messages (to_child_id, created_at)
  WHERE status = 'unread';

CREATE INDEX idx_kid_messages_from_parent
  ON kid_messages (from_parent_id, created_at DESC);
```

**Business rules** (enforce in app layer, not DB):
- A message can only be deleted while `status = 'unread'` (becomes `deleted_by_sender`, `deleted_at` set).
- Once `status = 'read'`, the message is immutable.
- `text` is the raw user input, 1-200 chars; no markdown, no HTML rendering on the kid side (escape on display).

### 4.3 `FamilyActivityLog`: new action enum values

**Existing column `action`** (Postgres enum or string constraint) gains:
- `message_sent` — payload: `{ message_id, to_child_id, char_count }` (do NOT log message text in the activity log — privacy)
- `message_deleted` — payload: `{ message_id }`

### 4.4 Zod types in `packages/types`

Add the `KidMessage` type and extend `ParentAccount`:

```ts
// packages/types/src/kid-message.ts
import { z } from 'zod'

export const KidMessageStatus = z.enum(['unread', 'read', 'deleted_by_sender'])

export const KidMessageSchema = z.object({
  id: z.string().uuid(),
  from_parent_id: z.string().uuid(),
  to_child_id: z.string().uuid(),
  text: z.string().min(1).max(200),
  status: KidMessageStatus,
  created_at: z.coerce.date(),
  read_at: z.coerce.date().optional(),
  deleted_at: z.coerce.date().optional()
})

export type KidMessage = z.infer<typeof KidMessageSchema>
```

```ts
// packages/types/src/parent-account.ts — add field
display_name_for_kids: z.string().min(1).max(50)
```

---

## 5. Event schema additions

**SIZE**: SMALL — add 4 events to the existing event pipeline.

**SURFACE**: parent app (fires `parent_message_sent`, `parent_message_deleted_by_sender`) · kid app (fires `parent_message_delivered_to_kid`, `parent_message_read`).

**PRIORITY**: P0 (ships with the Messages feature).

The cross-module event schema in `product-spec-v0.1.md §9.3` gains:

| Event | Properties | Fired by | When |
|---|---|---|---|
| `parent_message_sent` | `parent_id, child_id, message_id, char_count` | parent app (or API server-side) | On successful POST `/api/messages` |
| `parent_message_delivered_to_kid` | `child_id, message_id, ts` | kid app | When the bandeau first appears for this message |
| `parent_message_read` | `child_id, message_id, time_to_read_ms` (from delivery to tap) | kid app | When the kid taps Continue in the reader screen |
| `parent_message_deleted_by_sender` | `parent_id, message_id, age_at_deletion_ms` | parent app | On successful DELETE `/api/messages/<id>` of an unread message |

**Do NOT include message text** in any event payload. Only metadata + IDs.

---


## Migration checklist (engineering)

Before/during the next dev sprint:

- [ ] Apply DB migrations from §4 (parent_accounts column, kid_messages table, FamilyActivityLog enum extension).
- [ ] Add Zod types in `packages/types` per §4.4.
- [ ] Build `/api/messages/*` endpoints per §1.3.
- [ ] Build parent app Messages section (M1, M2, M3) per §1.1.
- [ ] Update parent app top nav to 5 items per §1.1.
- [ ] Add "Leave a word" affordance at end of classification flow per §2.1 + §1.1.
- [ ] Build kid app message bandeau + reader screen per §1.2.
- [ ] Add 4 new events to the event pipeline per §5.
- [ ] Sweep all UI strings + emails for the brand-positioning shift per §3.1.
- [ ] Update email digest template per §2.2.
- [ ] Add `display_name_for_kids` field to Settings → Profile screen.
- [ ] Build admin Messages feature-health dashboard per §1.5 (materialised SQL views + tile group).

---

## End of changes v1.

When the next batch of changes arrives, append as **v2** below the existing content (do not modify v1 entries — they are historical record of what was agreed).
