# Gabee — Parent Spec v0.2 (MVP + vision)

The parent web app on `parents.gabee.app`. Companion to `product-spec-v0.1.md`, `gabee-ux-spec.md`, `gabee-admin-spec.md`, and `gabee-design-spec.md`.

Full parent vision; each section tags **Phase 1 (MVP)** vs **Phase 2 (post-launch)** vs **Phase 3+ (future)** scope. §14 Future holds the things deliberately deferred.

**Conventions**
- State vocabulary from UX spec — `Default` · `Loading` · `Empty` · `Error` · `Offline` · `Disabled`.
- Flows numbered `P#`; screens numbered per-section (H1, K1, K2…).
- Microcopy in this spec is **EN** for brevity; the UI itself is bilingual **FR / EN**, switchable from the top bar, defaults to FR.

---

## 1. Purpose & mental model

The parent app does three jobs, in this order of urgency on the home screen:

1. **Surface classification work that needs attention** — kid sessions await the parent's verdict (*self-initiated* vs *parent-prompted*). This is the single signal that distinguishes "kids love it" from "parents push it" (product spec §8, §13). It must be the first thing the parent sees on arrival, and it gets its own top-nav menu.
2. **Show what the kids are doing, at a glance** — a quick per-kid pulse below the classification card. Who played today, what they did, where they're at.
3. **Show aggregates and trends** — cross-kid totals, week-over-week movement, healthy-use indicators. The "stand back and see the shape" view.

Beyond the home, two further jobs:
4. **Deep per-kid analytics** — every metric the kid app captures (performance per module, including coding and typing), available on demand.
5. **Quality feedback channel** — rating + comment on any item, feeding the admin review loop.

**Architecture choices that follow:**
- **Fully responsive.** Phone, tablet, desktop are all first-class — no canvas is the "default." The layout adapts; no single form factor wins. Email-deep-link routes work identically everywhere.
- **Email is the heartbeat.** Web apps don't earn "always-on" attention; few parents enable browser notifications. The daily classification digest does the prompting; the app handles the work when the parent clicks through.
- **One device hosts the kid app, the parent uses their own.** The parent pairs the home computer or tablet by signing in to the kid app once. After that, kids open it, pick their profile, pick their language, and play — no kid login. The parent app lives on the parent's own device, separately.
- **Co-parenting is a first-class case.** Two adults can share a child profile and act on it with equal rights; the app logs which parent did what so neither is in the dark.

---

## 2. Role

One role: **parent**. A parent account can be **linked to other parent accounts** sharing the same child profiles (co-parents — §8). Each parent sees the same kids and has the same write rights on them. Server-side every protected route handler checks `child_id IN (children linked to request.parent_id)`. Children have no login of their own.

---

## 3. Information architecture

Top-bar navigation, four destinations:

```
[Ga-bee logo (mint)]   Home   Classification(N)   Kids   Settings    [🔔]  [FR/EN]  [Avatar▾]
```

- **Home** (§5) — daily landing: classification card first, kids pulse next, aggregates below.
- **Classification** (§6) — the dedicated flow; the `(N)` badge counts unclassified sessions and the menu item turns coral when N > 0 (the only place coral appears in the parent app — see §4.5).
- **Kids** (§7) — kid list + per-kid deep dive.
- **Settings** (§9) — profile, password, family / co-parents, paired devices, notifications, account deletion.
- **Avatar menu** — Profile, Sign out.
- **Bell** — alternative entry to classification + recent admin replies on feedback.

At narrow widths, the top nav collapses into a bottom tab bar (Home · Classification · Kids · Settings) for thumb reach; at wide widths it stays as a horizontal top bar. Deep links from email always land directly on the target screen regardless of device.

**Feedback** (§10) is *contextual* — it appears inline as a "Rate this" affordance next to module / level / lesson / question items wherever the parent encounters them.

---

## 4. Global patterns

### 4.1 State catalog

| State | Treatment |
|---|---|
| `Loading` | Skeleton cards / rows. No spinner-of-doom. |
| `Empty` | Warm card explaining what would fill it + the one next action. Mascot present (mint, idle expression). |
| `Error` | Inline error with retry; **never lose what the parent typed** (preserve form values). |
| `Offline` | Banner ("Last synced …"). Read-only. |
| `Disabled` | Dimmed with tooltip stating the reason. |

### 4.2 Bilingual UI

- UI language toggle in the top bar (FR / EN), persisted on the parent account.
- The parent app **does not translate kid content**. When showing a question the kid encountered (session detail, feedback context), it appears in the *kid's session language* — the language the kid chose at the start of that session (§7.2 note on kid-side language).

### 4.3 Notifications & emails

The parent app does **not** rely on browser push. All proactive contact is via email (Mailgun), sent from `gabee.app`:

| Email | Trigger | Cadence | Default |
|---|---|---|---|
| Welcome + verify | Signup | Once | on |
| Classification digest | Unclassified sessions > 12h old | Daily (morning local time) | **on** |
| Weekly summary | End of week | Weekly | on |
| Feedback response | Admin replies to a comment | Per reply | on |
| Co-parent invite | Another parent invites you | Per invite | always |
| Account / security | Password change, new paired device, account deletion | Per event | always |

Mutable in **Settings → Notifications** (§9.5). Security + co-parent invites are always on (greyed toggles).

### 4.4 Responsiveness

- The layout adapts across phone, tablet, and desktop widths — no single canvas is the "default." Every screen works equally well anywhere.
- At narrow widths, the top nav collapses into a bottom tab bar (Home · Classification · Kids · Settings).
- Classification flow (§6) has large tap targets and a swipe-friendly layout regardless of device.
- Forms wrap to single column at narrow widths; date pickers use the native component on touch devices.
- Lists virtualize for long histories.

### 4.5 Parent visual identity

Self-contained here. Same Gabee tokens as the rest of the system, with two parent-specific variations.

**Wordmark — full bee-as-g in mint.**
- The illustrated "g" (the bee) uses **mint `#5FD3BE`** for the body; "abee" set in Mulish 800 ink (`#20242E`).
- Used in the top-bar logo and the login / signup screens.

**Mascot — mint body.**
- When the bee appears as an illustration (welcome hero, empty states, success toasts, decoration), the body is **mint `#5FD3BE`**.
- Everything else identical to `gabee-design-spec.md §2`: **cyan eyes** (`#2BD4E6`), **ink visor** (`#20242E`), **light-cyan wings** (`#BBEAF2`), **dark stripes** (ink), **antennae** (ink with cyan ball tips).
- The visor **expression system** (`gabee-design-spec.md §3` — idle / correct / celebrate / encourage / focus) applies contextually.
- Implementation: only the SVG body fill changes vs. other surfaces. One CSS variable or `currentColor` reference is sufficient.

**One exception — the Classification menu item.**
- When the unclassified count is `> 0`, the **Classification** label and its `(N)` badge use **coral `#FF8A6B`** to signal "needs your attention." Once the queue is empty, it returns to the regular ink color. This is the only place coral appears in the parent app.

Everything else (typography, spacing, radii, motion, module / feedback colors, accessibility) follows `gabee-design-spec.md` unchanged.

---

## 5. Home

Three stacked sections, in priority order. They stack vertically at narrow widths; at wide widths the first two may sit side-by-side.

### 5.1 Classification card (Phase 1) — top

Reflects the queue. Three states:

| Queue state | Card content |
|---|---|
| `N > 0` | "**N sessions need your input.**" Subtext: "Tell us if your kid asked to play or if you suggested it." Primary CTA: **Classify now** (large, coral). Pulses gently if N ≥ 5. |
| `N = 0` | "All caught up 👍" with mascot (mint, idle expression). Subtext: "We'll email you when there's something new." |
| `Offline` | "We can't sync right now. Last seen N sessions to classify." CTA disabled. |

Tap → classification flow (§6) starting at the oldest session.

### 5.2 Kids pulse (Phase 1, narrative Phase 2)

A per-kid row, one per linked child (up to 3, scrollable at narrow widths if 3 don't fit). Each shows:

- Avatar + name + age (years)
- Activity today: "3 sessions · 28 min" or "didn't play today"
- A small per-module pip row (5 dots, ink-grey for "no play today", module-color filled for "played today"). Tap a pip → kid detail filtered to that module.

Below the row, **Phase 2** narrative card: a single sentence describing the day, generated by a deterministic ruleset (§5.4): "**Ana** was super active today" / "**Léo** reached level 4 in Numbers" / "Quiet day today." Tap → kid detail.

### 5.3 Aggregates (Phase 2)

Cross-kid summary tiles, compact:

- **This week's total time** + comparison to last week (e.g., "1h 50m, +12%").
- **Sessions this week** with a small spark line for the last 7 days.
- **Adherence** (overall % self-initiated, with arrow vs last week — Phase 2 because it needs accumulated classification data).
- **Healthy use** (a single check / warn pill: "All sessions within healthy bands ✓" or "Some long sessions this week — see Kids → name").

Phase 1 ships with just the **total time** and **session count** tiles; the rest light up in Phase 2 as data accumulates.

### 5.4 Narrative rules (Phase 2)

Deterministic, server-computed nightly per parent. Priority order:
1. A kid reached a new level today → "**`<Name>`** reached level `<n>` in `<module>` today 🎉"
2. A kid has ≥ 2 sessions OR ≥ 20 min today → "**`<Name>`** was super active today (`<sessions>` sessions, `<time>` min)"
3. A kid maintained a streak ≥ 5 days → "**`<Name>`** is on a `<n>`-day streak — nice"
4. No kid played today → "Quiet day today."

Ties broken by most-engaged kid first. One narrative per home visit per day.

### 5.5 Screens & states

**H1 · Home** — content above; `Default`, `Loading`, `Empty` (no kids yet → primary CTA to add one; no devices paired → secondary CTA to pair the kid app, §9.4), `Error`, `Offline`.

**H2 · Session detail modal** — opened from classification, kid detail activity, or feedback context.
- *Content*: session metadata (kid, module, level, lesson, start, duration, device), **question-by-question summary**: what was asked, the kid's answer(s), correct or not, time to answer, hint used.
- *Actions*: "Rate this lesson" / "Rate this question" (feedback, §10).
- *States*: `Default`, `Loading`, `Error`.

---

## 6. Classification (Phase 1)

The single most-touched flow. Reached from: email link (primary entry), home card (5.1), top-nav menu (Classification), bell.

### 6.1 Flow

**C1 · Classification flow** — full-screen, one session at a time, swipe-friendly at narrow widths.

Per session, the parent sees:

- **Header**: kid avatar + first name; "Session on `<date>` at `<time>`, `<module>` level `<n>` lesson `<m>`, lasted `<X> min`."
- **The question**: "Did `<Name>` ask to play, or did you suggest it?"
- **Three large buttons** (large enough for thumb taps):
  - **They asked** (self-initiated)
  - **I suggested** (parent-prompted)
  - **Not sure** (counts as unknown, removed from queue — does not pollute adherence)
- **Skip for now** (small text link, keeps in queue).
- A small "Why we ask" link → help screen.

After submission, the next session loads automatically. Progress bar at top ("3 / 8"). On the last one, a thank-you screen with mascot in celebrate expression.

### 6.2 Entry points & deep-linking

- **Email link**: `parents.gabee.app/classify?session=<id>` lands directly on that session if still unclassified, otherwise on the queue head. If the user isn't signed in, the URL is preserved through login.
- **Home card / top nav / bell**: lands on the queue head (oldest unclassified).
- **From session detail (H2)**: a "Classify this session" action if it's still in the queue.

### 6.3 Co-parent dynamics

Either parent can classify any session. The classification records `actor_parent_id`. If one parent classifies, the session disappears from the other's queue immediately on next sync (last-write-wins; conflict is impossible because the action is idempotent — same session, same possible labels).

### 6.4 Screens & states

**C1 · Classification flow** — `Default`, `Loading`, `Empty` ("All caught up", mascot celebrate, "Back to home"), `Error` (preserve selection), `Offline` (read-only with banner).

---

## 7. Kids

### 7.1 Kids list (Phase 1)

**K1 · Kids list**

Header: "**Your kids**" + add button (disabled with tooltip if at 3-kid limit; co-parents share the same 3-kid limit on the account).

Below the header, kid cards (up to 3) — avatar, first name, age, current level summary, last active. Tap → K2.

Below the cards, **Recent family activity** (Phase 1 simple, Phase 2 rich) — combined chronological feed across all kids AND both parents:

- *Kid actions*: "Ana finished Numbers level 3 · 2h ago", "Léo started a Words session · today 6pm"
- *Parent actions*: "**You** classified 3 sessions · today 8am", "**Marie** (co-parent) added feedback on Code level 2 · yesterday"

Each item links to the relevant detail (session, feedback, or kid).

*States*: `Default`, `Loading`, `Empty` (no kids → primary CTA to add the first one, mascot idle), `Error`.

### 7.2 Add a kid (Phase 1)

**P1 · Add a kid** — modal at wide widths, full screen at narrow widths.

Fields:
- **Name** — first name (real name), 2-20 chars.
- **Birthday** — date picker; used to compute age in **years**. Used Phase 3+ for age-appropriate content matching; stored now.
- **Avatar** — pick 1 of 4 presets (product spec §3).
- **Current school level** — CP / CE1 / CE2 / autre. Stored for Phase 3+ curriculum matching.
- **Learning objectives** — checkboxes: *Math basics*, *Reading*, *Writing*, *English*, *Logic / coding* — plus a free-text "Anything else?" Stored for Phase 3+ AI authoring context.

**No language field here.** Language is **picked by the kid at the start of each session** in the kid app — a playful prompt right after they pick their profile: *"What language do you want to learn in today, `<Name>`?"* with the two language choices. The kid may play in FR on Monday and EN on Tuesday; the parent app surfaces sessions tagged with the language the kid chose.

Submit → kid profile created (linked via `ParentChildLink` with role `primary` to the inviter), lands on K1 with the new card.

*Note (MVP scope)*: `current_school_level` and `learning_objectives` are *collected but not enforced* in Phase 1 (single default content per admin spec). They're stored so Phase 3 multi-curriculum personalisation works without a migration.

### 7.3 Per-kid detail (Phase 1 basic, Phase 2 deep)

**K2 · Kid detail**

Header bar: avatar (large), name, age in years, current level per module (compact chips, module-colored), last active. Edit pencil → K3.

Below the header, **tabs** (collapsing to an accordion at narrow widths): **Overview** · **Activity** · **Performance** · **Strengths & weaknesses** · **Feedback**.

#### 7.3.1 Overview (Phase 1)

Top-line cards:
- **Total time this week** + vs last week (Phase 2 comparison).
- **Sessions this week** with a 7-day mini sparkline.
- **Adherence**: % of classified sessions that were self-initiated (Phase 2 — needs classification accumulated).
- **Healthy use** indicator: a check / warn pill showing whether session lengths sit within the recommended band (product spec §6 healthy use).
- **Streak**: current and longest streak (Phase 2).

#### 7.3.2 Activity (Phase 1)

Chronological session list (last 7d / 30d / all toggles). Per session: module + level + lesson, start time, duration, % correct, classification status, language used (FR/EN flag). Tap → H2 session detail (with question-by-question content, §5.5).

Filters: module, language, classification status, date range.

#### 7.3.3 Performance — per-module deep dive (Phase 2)

One card per module the kid has touched. Each card has:

**Numbers** (Phase 2)
- Sessions count, total time, highest level reached.
- Accuracy by operation type (addition / subtraction / etc. — derived from question-level data).
- Average time per question (read at this kid's age).
- Hint usage rate.

**Words** (Phase 2)
- Sessions count, total time, highest level reached.
- Per sub-mode performance (picture-to-word, fill-blank, build-the-sentence, read-and-answer).
- Vocabulary touched / mastered.
- Reading comprehension accuracy.

**Keyboard** (Phase 2)
- Sessions count, total time, highest level reached.
- **Typing speed** (chars per minute, child-appropriate — not adult WPM).
- **Typing accuracy** (correct keystrokes / total).
- **Common error keys** (top 3 confusion pairs — derived from `typing_keystroke` events).
- Improvement trend over the last 30 days.

**Code** (Phase 2 — the parent should *see* their kid's coding work)
- Sessions count, total time, highest level reached.
- **Code runs**: total runs · successful / total ratio.
- **Average sequence length** at the kid's current level (how many blocks the kid uses).
- **Time to first successful run** per level (a learning-speed proxy).
- **Block usage** distribution (movement / loop / conditional — shows when the kid is using complex blocks).

**Translation** (Phase 2)
- Sessions count, total time, highest level reached.
- **Direction performance**: FR→EN accuracy vs EN→FR accuracy (most kids prefer one direction).
- Most-missed concepts (Phase 3+).

Every card is collapsible; at narrow widths they collapse by default and the parent expands the ones they care about.

#### 7.3.4 Strengths & weaknesses (Phase 2)

For each module included, one row showing:
- A horizontal bar of % correct over the last 30 sessions.
- **Strongest objective** — the `ContentPlan` objective with the highest correctness.
- **Weakest objective** — the lowest. Links to a "What is this?" help page.

This view depends on the admin's `ContentPlan` objectives being attached to questions (admin spec §6.1, §12 data model `Question.objective_ref`) — Phase 2 because Phase 1 doesn't ship the admin authoring loop.

#### 7.3.5 Behavioral patterns (Phase 2)

- **Volition signals**: retry / replay / continued-play counts (the kid choosing to keep going).
- **When they play**: heatmap (day of week × hour of day) — useful for spotting "always after dinner" patterns.
- **Hint usage rate over time**: trending down = increasing independence.
- **Session length distribution**: histogram with the healthy band highlighted; flags if max session > cap.

#### 7.3.6 Feedback on this kid's content (Phase 1)

A list of all feedback any parent on the account left on items this kid played. Sortable by date / module / status. Each item links back to the content item. New feedback comes from the inline affordance (§10).

*States*: `Default`, `Loading` (skeleton), `Empty` (no sessions yet → "Once `<Name>` plays, this will fill up."), `Error`.

### 7.4 Edit / remove a kid (Phase 1)

**K3 · Edit kid** — same fields as 7.2. Both parents can edit. Changes write to the family activity log (§7.1 feed).

**P2 · Remove a kid** — destructive. Confirmation requires typing the kid's name. Effect: profile + sessions + classifications + feedback soft-delete (recoverable for 30 days), then hard-delete. Audit-logged on the backend. If two co-parents are linked, **either** can remove a kid; the other gets a notification.

---

## 8. Family & co-parents (Phase 1)

Two adults can share kids and act on them with equal rights. The first parent to sign up is the **primary** parent (used as billing context later); both have the same in-app powers.

### 8.1 Concepts

- A `ParentAccount` can be linked to one or more `ChildProfile`s via `ParentChildLink` (many-to-many).
- Limit at MVP: **up to 2 parents per child** (extensible later for blended families).
- Both parents see the same kids, devices, activity, feedback. Mutations are attributed to the actor (`actor_parent_id`).
- Either parent can invite a co-parent, edit/remove a kid, classify sessions, pair / revoke devices, leave feedback.

### 8.2 Flows

**P3 · Invite a co-parent** (Settings → Family — or Kids → Family tab)
1. Form: co-parent's email + optional personal note.
2. Submit → system creates a `CoparentInvite` (status `pending`, 7-day expiry) and sends an email via Mailgun:
   - If the email matches an existing parent account: "X invited you to co-parent `<Kid names>` on Gabee — Accept | Decline."
   - If the email is new: "X invited you to share their kids' Gabee — Create your account."
3. Inviter sees the invite under **Settings → Family → Pending invites** with a *Cancel invite* action.

**P4 · Accept the invite**
- *Existing account*: clicks link → signs in if needed → confirmation screen listing the kids being shared + accept / decline buttons. Accept → linked, lands on Home with a welcome banner.
- *New account*: clicks link → signup form pre-filled with invitee email + the invite token → on successful signup + email verification, automatic linking. Lands on K1 with all the kids visible.

**P5 · Decline or expiry**
- Decline → invite marked declined, inviter notified by email.
- 7-day expiry → invite marked expired, inviter sees it in the pending list with a *Re-invite* action.

**P6 · Remove a co-parent**
- Either parent can remove either co-parent (including themselves) from **Settings → Family**.
- Confirmation: "X will lose access to `<Kid names>`. They keep their own account. This cannot be undone without re-inviting." 
- The primary parent cannot be removed by a co-parent (only the primary can step down, transferring primary status first).

### 8.3 Family activity log (Phase 1)

Every parent mutation records an `actor_parent_id`:
- Session classification (which parent labeled it)
- Feedback left / edited
- Kid added / edited / removed
- Device paired / revoked
- Co-parent invited / removed
- Settings changes that affect both parents (e.g., notification preferences — these are *per-parent* though, not shared)

Surfaced in:
- **Kids → Recent family activity** (§7.1 feed) — chronological cross-actor log.
- **Kid detail → Activity tab** — kid-scoped subset of the same data.

### 8.4 Screens

**FAM1 · Family panel** (Settings → Family)
- Linked parents list (with role *primary* / *co-parent*, email, name, joined date, remove button).
- Pending invites list (with cancel button).
- "Invite a co-parent" CTA.

**FAM2 · Accept invite** (from email link)
- Header: "X invited you to co-parent on Gabee."
- List of kids being shared.
- Accept / Decline.

*States*: `Default`, `Loading`, `Error` (expired or invalid token → friendly error + "Ask `<inviter name>` to send a new invite").

---

## 9. Settings

### 9.1 Profile (Phase 1)

**ST1 · Profile** — first name, last name, email (editable; change triggers re-verification), country, UI language preference. Save / cancel.

### 9.2 Password (Phase 1)

**ST2 · Change password** — current + new + confirm. Triggers a security email notice.

### 9.3 Family (Phase 1)

See §8.4 FAM1.

### 9.4 Paired devices & the kid-app link (Phase 1)

**ST3 · Paired devices** — list of devices where the kid app is signed in.

Per row: device label ("Home computer · Chrome on macOS" auto-generated or parent-set), pairing date, last activity, **Revoke** button. Revoke → invalidates the refresh token on that device + flags the row; kids on that device must wait for re-pairing.

**Pair a new device** (always available, not only at onboarding):
- A persistent action **"Send the kid-app link to a device"** opens a small form: a target email (defaults to the parent's own, can be set to anyone — for sending the kid app link to a tablet via email).
- Submit → sends an email with the link `kids.gabee.app` + a one-time pairing token (valid 24h, simplifies signin on that device).

A note in this section, plain language:
> *Once paired, the kid app stays signed in on that device for a long time (about 6 months) so kids can just play. Your own parent session here is shorter (about 30 days) for security. Revoke anytime.*

### 9.5 Notifications (Phase 1)

**ST4 · Notifications** — toggles for the email categories in §4.3 (security and co-parent invites are always on, greyed). Classification digest cadence: daily / every 2 days / weekly / off (warning on "off": reduces what we can show on the home).

### 9.6 Account deletion (Phase 1)

**ST5 · Delete account** — destructive. Type email to confirm + explanation of what's deleted (own account; if primary, primary status transfers to a co-parent or all linked data is offered for transfer; if no co-parent, sessions/profiles/feedback are deleted). Creates a `GDPRRequest` of kind `erase` (admin spec §9, §12) and signs the parent out. Confirmation email sent. Admin executes manually per the admin GDPR workflow.

---

## 10. Feedback (Phase 1)

The parent can rate (1-5) and comment on **any** content item — module, level, lesson, or question.

### 10.1 Inline feedback affordance

Wherever an item is shown (H2 session detail, K2 activity, etc.) a small star button appears. Tap → modal.

**F1 · Feedback modal**
- Target context shown at top ("Numbers · Level 3 · Lesson 2" or the question text).
- 1-5 star control (large, easy to tap).
- Free-text comment (optional).
- Submit / cancel.
- Feedback sent to the admin review queue (admin spec §10). Attributed to the actor parent.

### 10.2 My feedback history

**F2 · Feedback list** — accessible from K2 (per kid, Feedback tab) or Settings → My feedback (all kids).

Table: date, target, rating, comment snippet, status (`new` / `triaged` / `replied`). Replied items can be opened for the admin's response (Phase 2 — Phase 1 replies arrive by email).

*States*: standard.

---

## 11. Account & onboarding

### 11.1 Signup (Phase 1)

**P7 · Self-signup**
- Form: first name, last name, email, password (≥ 8 chars, ≥ 1 digit, ≥ 1 letter), country (preset from IP, editable), accept T&C.
- Submit → account row created (`status='unverified'`) + verification email sent + "Check your email" interstitial.
- Email enumeration protection: existing-email submissions return the same interstitial; the existing account receives a "Someone tried to sign up with your email" notice.

**S1 · Signup form** — single column, mascot top-right (mint, idle), FR/EN toggle.
**S2 · Check-your-email** — "We sent a link to `<email>`. Click within 24h." Resend button (rate-limited 1/min).

### 11.2 Email verification (Phase 1)

`/verify?token=<jwt>` validates → flips `status='active'` → lands on first-time setup. Expired tokens (>24h) → "Send a new link" flow.

### 11.3 First-time setup (Phase 1)

Short wizard, dismissible (home keeps nudging until done):

**P8 · Add the first kid** — see §7.2.

**P9 · Pair the home device**
1. Screen: "To let `<Name>` play, set up Gabee once on the family device. Open this link there and sign in: `kids.gabee.app`." With **Send me the link by email** button.
2. The parent walks to the family device, opens `kids.gabee.app`, signs in with their Gabee credentials. The kid app stores the device pairing token locally (long-lived refresh token, see §9.4 note) and switches to the kid profile picker.
3. Back in the parent app, an auto-check (or "I'm done" button) confirms — new device appears under **Settings → Paired devices** (§9.4).

**P10 · You're set** — celebration screen, mascot celebrate, summary ("`<Name>` can now play on `<device>`. We'll email you tomorrow with their first sessions to classify.")

### 11.4 Login & forgot password (Phase 1)

**P11 · Login** — email + password. "Remember me" → 30-day session. Generic error on wrong credentials. 5 wrong → 15-min lockout + security email.

**P12 · Forgot password** — email field → "If an account exists, we sent a reset link." 1-hour token; reset form → auto-login.

---

## 12. Data model additions

Sketched as Zod-style records to fit `packages/types`. Composes with the admin spec data model.

```ts
ParentAccount {
  id: string
  email: string
  email_verified_at?: Date
  first_name: string
  last_name: string
  country: string
  ui_language: 'fr' | 'en'
  status: 'unverified' | 'active' | 'locked' | 'pending_deletion'
  password_hash: string                  // Supabase-managed
  created_at: Date
  updated_at: Date
}

// Many-to-many: parents ↔ children
ParentChildLink {
  parent_id: string                      // FK ParentAccount
  child_id: string                       // FK ChildProfile
  role: 'primary' | 'coparent'
  linked_at: Date
  invited_by?: string                    // FK ParentAccount (null for the primary)
  // PK is (parent_id, child_id)
}

ChildProfile {
  id: string
  primary_parent_id: string              // first to create; used for billing / GDPR context
  name: string                           // real first name (product spec §3, 2-20 chars)
  birthday: Date                         // age in years derived
  avatar: 'avatar_1' | 'avatar_2' | 'avatar_3' | 'avatar_4'
  current_school_level?: 'CP' | 'CE1' | 'CE2' | 'autre'
  learning_objectives: {
    tags: Array<'math_basics' | 'reading' | 'writing' | 'english' | 'logic_coding'>
    free_text?: string
  }
  curriculum_id: string                  // always 'default' in MVP
  // module_visibility / module_focus reserved Phase 3+ (admin spec §15)
  // No starting_language field — the kid picks language at each session start in the kid app.
  created_at: Date
  updated_at: Date
  soft_deleted_at?: Date
}

// Co-parent invitations
CoparentInvite {
  id: string
  inviter_parent_id: string
  invitee_email: string
  child_ids: string[]                    // which kids to share (currently always all kids the inviter has)
  token: string                          // signed JWT, 7-day expiry
  personal_note?: string
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
  expires_at: Date
  created_at: Date
  resolved_at?: Date
}

// Device pairing for the kid app
DeviceLink {
  id: string
  parent_id: string                      // who paired this device
  label: string                          // auto-generated or parent-set
  user_agent_hint: string                // raw UA for the auto-label
  refresh_token_id: string               // Supabase session ref (long-lived ~6 months)
  paired_at: Date
  last_active_at: Date
  revoked_at?: Date
  // TTL note: kid-app refresh token ≈ 180 days; parent web session ≈ 30 days (configurable in Supabase).
}

// Per-parent notification preferences
NotificationPrefs {
  parent_id: string                      // PK
  classification_digest: 'daily' | 'every_2_days' | 'weekly' | 'off'
  weekly_summary: boolean
  feedback_response: boolean
  // security + coparent_invite emails always on; not stored
  updated_at: Date
}

// Activity log: parent mutations visible to all linked parents on a kid
FamilyActivityLog {
  id: string
  child_id: string                       // every entry is kid-scoped
  actor_parent_id: string
  action:
    | 'session_classified'
    | 'feedback_left'
    | 'feedback_edited'
    | 'kid_added' | 'kid_edited' | 'kid_removed'
    | 'device_paired' | 'device_revoked'
    | 'coparent_invited' | 'coparent_joined' | 'coparent_removed'
  payload: any                           // small JSON: session_id / feedback_id / device_id / etc.
  created_at: Date
}

// Narrative card source (Phase 2)
DailyActivityNarrative {
  parent_id: string                      // PK with date
  date: Date
  rule_id: 'kid_most_active' | 'kid_reached_level' | 'kid_streak' | 'quiet_day'
  payload: any                           // kid_id, module_id, level, etc.
  generated_at: Date
}

// Feedback reuses the admin spec §12 schema; the parent app is the producer, admin the consumer.
```

**Token TTLs (operational note)**

| Token | Surface | TTL | Why |
|---|---|---|---|
| Kid-app refresh token (stored on paired device) | `kids.gabee.app` | **~180 days** | Kids should be able to open and play without re-pairing every week. Long-lived = fewer parental interventions for a non-security-sensitive surface (kids have no destructive powers). Revocable from the parent app anytime. |
| Parent web session | `parents.gabee.app` | **~30 days** with "remember me" | Standard security hygiene on an account with mutation rights. |
| Parent ↔ classification deep-link tokens | from email | 7 days | Match digest cadence headroom. |
| Co-parent invite tokens | from email | 7 days | Reasonable window without leaving stale invites. |
| Password reset tokens | from email | 1 hour | Standard. |

---

## 13. Cross-cutting

- **Accessibility** — ≥ 44px tap targets, keyboard navigation, focus rings, AA contrast on all text. Forms preserve content through errors. Mascot has accessible labels.
- **i18n** — UI FR / EN, switchable in the top bar, persisted on the account. Default FR. Kid-content excerpts (session detail H2) render in the *kid's session language*, not the parent's UI language.
- **Responsive** — the layout works equally on phone, tablet, and desktop. The top nav collapses to a bottom tab bar at narrow widths. Deep-link routes from email work identically everywhere.
- **Performance** — list views paginate (50 default), activity feed virtualizes for long histories, skeleton loading not spinners.
- **Privacy** — every protected route handler checks `child_id IN (children linked to request.parent_id)`. Children's data is never exposed externally without parent consent. Question content is visible to parents per their decision (open question #2 resolved).
- **Same-origin same-app** — the parent UI is part of `apps/web` (route group `(parent)`); auth via `@supabase/ssr`; same-origin Server Actions / route handlers (no CORS). See product spec §11.

---

## 14. Open questions

| # | Question |
|---|---|
| 1 | **Co-parent invite scope** — Phase 1 always shares all kids. Should Phase 2 let the inviter pick which kids to share (for split-custody edge cases)? |
| 2 | **Co-parent limit** — Phase 1 cap at 2 parents per child. Lift to 3 for blended families later? |
| 3 | **Narrative rule set** — confirm the priority order in §5.4; worth its own mini-doc when Phase 2 ships. |
| 4 | **Kid-app pairing token rotation** — should the long-lived kid token auto-rotate on use (silent refresh) or stay fixed for 180 days then require re-pair? |
| 5 | **Healthy-use band** values — the bands shown in K2.7.3.5 need concrete numbers (e.g., "session 10-25 min healthy, 25-40 watch, >40 too long for a 6-yo"). Pedagogical input needed. |

---

## 15. Future (Phase 3+)

- **Per-kid module visibility** — parent hides a module from a kid's hub. `ChildProfile.module_visibility: Record<Module['id'], boolean>` (admin spec §15).
- **Per-kid module focus** — parent highlights one module on the kid's hub.
- **Curriculum assignment** — when multi-curriculum unlocks (admin spec §15), parent picks (or accepts auto-match) per kid; switchable later.
- **Split-custody invite scope** — share only some kids with a co-parent.
- **Rich GDPR self-service** — JSON / CSV export from settings, no admin step.
- **In-app admin replies** on feedback (Phase 1 uses email).
- **AI-derived insights per kid** ("Ana is ready for harder subtraction") — sits on top of the strengths / weaknesses data.
- **Family billing** if Gabee ever goes paid — subscription, payment methods.

