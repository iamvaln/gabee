# Gabee — UX Spec v0.1

The layer between **what** (product-spec-v0.1) and **how it looks** (gabee-design-spec). This document is what a designer or developer uses to lay out every screen and flow without re-deciding product or brand. References: `product §N` and `design §N`.

Scope: **all three surfaces** — Kid app (Phase 1 core, most detail), Parent dashboard (web), Admin back office (web).

---

## 0. UX principles

1. **The bee is the guide.** One persistent companion across the kid app; its visor expression carries emotion (design §3). It guides, never nags.
2. **Desktop-first, but calm and large.** Keyboard + mouse are learning objectives (product §1); targets stay big and rounded so it's still touch-friendly.
3. **Low-text for early readers.** Icons + colour + (post-MVP) voiceover carry meaning; text is short and always paired with an icon. A 6-year-old who can't read fluently should still navigate.
4. **Bilingual & symmetric.** FR and EN are equal; the child can switch language anytime, anywhere — no locked primary (product §2).
5. **No dark patterns.** No FOMO, no streak-guilt, no red-dot nagging, no infinite scroll. Gamification is content-neutral (product §6). Healthy-use guardrails are visible and gentle (product §6.3).
6. **Mistakes are safe.** Wrong answers are encouraged, never penalised or shamed (product §6.3, design §3).
7. **One thing per screen.** A single primary action; minimal chrome; lots of breathing room.

---

## 1. Personas & contexts

| Persona | Surface | Context | Key needs |
|---|---|---|---|
| **Child (6–8)** | Kid app | Home computer, often supervised; short sessions; may not read fluently | Recognisable icons, big targets, instant feedback, no friction, no login |
| **Parent** | Parent dashboard (web) | Phone/laptop, weekly rhythm, low time budget | Quick reassurance, easy session labelling, calm insight — not surveillance |
| **Admin / Content reviewer** | Admin back office (web) | Laptop, focused work sessions | Efficient content review, bilingual parity, cost visibility |

---

## 2. Information architecture

### 2.1 Kid app
```
Launch
 └─ (device auth — once, by parent) 
     └─ Profile select  (avatar grid, up to 3)
         └─ Home  (module grid + bee + language toggle)
             ├─ Numbers   ─ Level map ─ Session (7 Q) ─ Session summary
             ├─ Words     ─ Sub-mode pick ─ Level map ─ Session ─ summary
             ├─ Keyboard  ─ Level map ─ Session ─ summary
             ├─ Code      ─ Level map ─ Session ─ summary
             ├─ Translation ─ Level map ─ Session ─ summary
             └─ Kid settings (language default, voiceover)
```
No kid login. No store, no social, no notifications. Persistent: Home, Back, language toggle, the bee.

### 2.2 Parent dashboard (web)
```
Login / Sign up
 └─ Household home  (children cards + "to review" badge)
     ├─ Classification queue   (label pending sessions)
     ├─ Child insights  (per child: North Star, volition, per-language heatmap, module progress)
     ├─ Profiles  (add/edit up to 3 children, avatar, language default)
     └─ Settings  (daily cap, voiceover, notifications, data/privacy)
```

### 2.3 Admin back office (web)
```
Login (role)
 └─ Dashboard  (parity coverage, AI usage, pipeline status)
     ├─ Content pipeline  (module ▸ level ▸ lesson ▸ generate ▸ review/rate ▸ confirm ▸ version/publish)
     ├─ Bilingual parity  (coverage per module/level/language)
     ├─ AI usage  (tokens / cost / calls per provider & model)
     ├─ Analytics  (aggregate + per-child)
     └─ Users & roles
```

---

## 3. Global patterns (define once, reuse everywhere)

### 3.1 Standard states
Every data-bearing screen specifies which of these apply.

| State | Treatment |
|---|---|
| **Loading** | Soft skeleton + bee `idle`; never a blocking spinner on full screen |
| **Empty** | Bee `idle` + one short line + one primary action |
| **Error** | Bee `idle` (never sad) + plain-language message + Retry; no error codes facing kids |
| **Offline** | Persistent subtle indicator; cached content keeps working; "will sync later" implied, not alarming (kid app §5.7) |
| **Locked** (levels) | Greyed tile + lock glyph + hint "Finish the level before to open this one" |
| **Disabled** | Reduced opacity, no nagging tooltip |

### 3.2 Feedback pattern (kid app)
- **Correct** → `--feedback-correct` accent + honey + bee `correct`/`celebrate`; one brief positive line; auto-advance (or large **Next**).
- **Try again** → `--feedback-retry` accent (gentle) + bee `encourage` (wink); encouraging line; the same question stays, child retries. **No score loss, no penalty, no shaming.**

### 3.3 Language toggle
A persistent **FR / EN** control (top corner). Switching is instant and global; it re-renders the current screen in the other language and resumes language-dependent progress on the relevant track (product §7.3: per-language progress for Words + Translation; unified for Numbers/Keyboard/Code).

### 3.4 The bee companion
Always present in the kid app near the prompt/feedback zone. Maps expression → moment per design §3 and analytics events (product §9.3): question shown → `focus`; correct → `correct`; level cleared → `celebrate`; wrong → `encourage`; otherwise `idle`.

### 3.5 Microcopy
Short, warm, second-person, bilingual parity (FR/EN strings always exist together). Always icon + text. No jargon, no time-pressure language, no guilt.

---

## 4. KID APP (detailed)

### 4.1 Screen inventory
Profile select · Home · Module level-map · Words sub-mode pick · Session (question) · Session feedback (inline) · Session summary · Level-complete celebration · Daily-cap reached · Kid settings · Offline indicator (overlay element).

### 4.2 Core flows

**F1 — First run (parent-assisted, once per device)**
1. App opens → device not yet linked → "Ask a grown-up" screen → parent signs in (email+password, Supabase) or creates account.
2. Device is linked (auth-once, product §7). Parent creates/sees child profiles.
3. Hand-off to child → Profile select.

**F2 — Create a child profile** (parent-assisted)
1. Name (typed by parent) → 2. Avatar (AI-suggested designs, product §3 — present a grid to pick from) → 3. Language default (FR/EN) → 4. Done → profile appears in grid.

**F3 — Pick profile & reach Home**
1. Profile select (avatar grid, ≤3) → tap own avatar → Home.
2. (No PIN by default; a profile is chosen by recognising one's avatar. Optional parent-set PIN is an open question — §8.)

**F4 — Play a session** (the core loop)
1. Home → tap a module tile.
2. (Words only) pick a sub-mode → Level map.
3. Level map → tap an unlocked level → Session begins (7 questions, product §4.0).
4. Per question: prompt shown (bee `focus`) → child answers (input pattern per module §4.4) → inline feedback (§3.2) → Next.
5. After 7 questions → Session summary (how many right, encouraging tone) → option to play again or go Home.
6. If the level is cleared to mastery → Level-complete celebration (bee `celebrate`, badge per product §6.2).

**F5 — Daily-cap / soft-limit reached** (product §6.3)
- At the daily cap: a calm "That's a great amount for today — see you tomorrow!" screen with the bee `idle`; no countdown timer pressure, no "one more" bait. Parent can adjust the cap in the dashboard.
- ~20-min soft limit: a gentle suggestion to take a break, dismissible, not blocking.

**F6 — Switch language mid-flow** — toggle FR/EN anytime (§3.3); current screen re-renders; progress resumes per track.

**F7 — Offline play** — see §5.7.

### 4.3 Screen-by-screen

**Profile select** — *purpose: pick who's playing.*
Layout: full-screen, ≤3 large avatar cards centred, each with name; the bee waves (idle). A small "grown-up" gear (to dashboard / add profile) is corner-placed and visually de-emphasised.
States: Empty (no profiles yet → "Ask a grown-up to set you up" + bee).

**Home** — *purpose: choose a module.*
Layout: greeting with child name + bee; a **grid of 5 module tiles**, each themed with its module colour (design §4.1), large icon + label. Persistent: language toggle, kid-settings gear (small). Progress is shown subtly per tile (e.g., a quiet ring), never as pressure.
States: Loading (skeleton tiles), Offline (indicator).

**Module level-map** — *purpose: choose a level.*
Layout: module-coloured header with module name + bee; a path/grid of **10 levels**; unlocked levels are tappable, completed levels marked, **locked** levels greyed with a lock + hint (§3.1). Back to Home always available.
States: Locked levels, Loading, Offline.

**Words sub-mode pick** — *purpose: choose one of the 4 Words exercise types* (product §4.2).
Layout: 4 large cards — Picture→Word, Fill-the-blank, Build-a-sentence, Read & answer — each with a representative icon. Then proceeds to that sub-mode's level map.

**Session (question)** — *purpose: answer one of 7.*
Layout: top = quiet progress (dots 1–7, current highlighted; no timer); centre = the prompt (module-specific, §4.4); the bee to the side (`focus`); answer area below with large targets. Back exits with a soft "Leave for now?" confirm (progress is safe).
States: Loading next question (skeleton), Offline (keeps working).

**Session feedback (inline)** — per §3.2; replaces/overlays the answer area briefly, then Next.

**Session summary** — *purpose: positive close.*
Layout: bee `correct`/`celebrate`; "You answered N of 7!" framed positively; **Play again** and **Home** as two large buttons. No leaderboards, no streaks-as-pressure.

**Level-complete celebration** — bee `celebrate`, star eyes, honey confetti (gentle, no strobe; reduced-motion safe), badge earned (product §6.2). Dismiss to level map.

**Daily-cap reached** — per F5; calm, final-feeling, friendly.

**Kid settings** — language default (FR/EN), voiceover on/off (when shipped, product §4.7). Minimal; anything sensitive lives in the parent dashboard.

### 4.4 Module-specific interaction patterns

| Module | Prompt | Answer input | Notes / events (product §9.2) |
|---|---|---|---|
| **Numbers** | Numerals, quantities, simple operations (to 200) | Large tappable options, or a big number pad for entry | language-agnostic progress |
| **Words — Picture→Word** | An image | Pick the word, or assemble it from letter tiles | per-language progress |
| **Words — Fill-the-blank** | Sentence with a gap | Pick the missing word from options | per-language |
| **Words — Build-a-sentence** | A word cloud | Tap/drag words into order | emits `sentence_build` |
| **Words — Read & answer** | Short passage + question | Pick the answer | tracks `passage_dwell_ms` |
| **Keyboard** | A target word/phrase | **Type on the physical keyboard**; on-screen keyboard highlights the next key | emits `typing_keystroke`, `typing_word_completed`; voiceover-supported (product §4.7) |
| **Code** | Guide **Gabee** to the star with a block sequence | Arrange blocks, then **Run** | emits `code_run`, `code_level_solved` |
| **Translation** | A word/phrase in one language | Pick/produce it in the other (bidirectional FR↔EN) | per-language; voiceover-supported |

Selection tasks emit `selected_option` (+ optional distractor `error_type`); process-rich modules (Keyboard, Code, Build-a-sentence) emit their own events (product §9.2).

### 4.5 Gamification surfaces (within guardrails)
Progress rings per module/level, badges for milestones (e.g., L10 mastery), celebration moments — **all content-neutral and non-coercive** (product §6.1). No daily-streak counters framed as loss, no push to return.

### 4.6 Offline behaviour UX (product §8)
- The app runs from a cached bundle; sessions are fully playable offline.
- A **subtle, non-alarming indicator** shows offline status; nothing blocks play.
- Session/event data queues locally (Dexie) and **syncs on next launch / session end / periodically**. A small "synced" confirmation is enough; failures retry silently.
- On sync, each new session's `session_start` (with `initiation_label = null`) enters the **parent classification queue** (product §9.3) and triggers the email nudge.

---

## 5. PARENT DASHBOARD (web)

Calm, weekly-rhythm, reassurance-first — **not** a surveillance console.

### 5.1 Screen inventory
Login / Sign up · Household home · Classification queue · Child insights · Profiles · Settings.

### 5.2 Core flows

**P1 — Sign up / link device**
1. Email + password (Supabase Auth) → verify → create household → add first child profile (F2) → link the kid device.

**P2 — Classify sessions (the key recurring task)** (product §9.3, §9.5)
1. Parent receives **one digest email** (send-time optimised, frequency-minimised — product §9.5) → "You have N sessions to review."
2. Click → Classification queue → for each pending session, pick one label: **Child-initiated · I prompted them · Not sure**.
3. Submit → queue clears; this feeds the adherence signal (product §13.2).
- The queue must be fast: one screen, batch-labellable, no mandatory fields beyond the single choice.

**P3 — Check in on a child**
1. Household home → child card → Child insights: **weekly active learning days** (North Star, product §13.1), volition signals (retry/replay/continued-play), **per-language heatmap** for Words + Translation, module progress, time-on-task with healthy framing.

**P4 — Manage** — add/edit profiles, set language default per child, adjust **daily cap** and voiceover, manage **notifications** (timing preference, not more frequency), **data/privacy** (export, delete — product §9.1).

### 5.3 Screen-by-screen

**Login / Sign up** — email + password; clear, minimal; password reset. States: Error (wrong credentials, plain language).

**Household home** — cards for each child (avatar, name, "last active"), a prominent but calm **"N to review"** badge linking to the queue. States: Empty (no children → add-profile CTA), Loading.

**Classification queue** — a list of pending sessions, each with date/time, module, and duration, plus the 3-way label control; a **Submit all** action. Designed to be done in under a minute. States: Empty ("All caught up 🐝"), Offline (queue not submittable → retry).

**Child insights** — North Star number up top, then volition signals, the per-language heatmap (which languages/sub-modes the child practises), module progress, and time framed healthily (no "engagement maximisation" language). States: Empty (not enough data yet → "Come back after a few sessions"), Loading.

**Profiles** — list (≤3), add/edit (name, avatar, language default), delete with confirm. 

**Settings** — daily cap, voiceover default, notification send-time preference, data export/delete, account. Privacy copy is plain and honest (product §9.1).

### 5.4 States summary
All screens support Loading / Error / Empty per §3.1. The dashboard is read-mostly; the only frequent write is classification (P2) and profile/settings edits.

---

## 6. ADMIN BACK OFFICE (web)

Efficient content operations with bilingual parity and cost visibility (product §5, §10.2).

### 6.1 Screen inventory
Login · Dashboard · Content pipeline · Bilingual parity · AI usage · Analytics · Users & roles.

### 6.2 Core flows

**A1 — Generate & review content** (product §5)
1. Pick **module ▸ level ▸ lesson**.
2. **Generate**: AI drafts candidate questions as **bilingual `{fr, en}` pairs** (product §5).
3. **Review queue**: for each candidate, **rate 1–5 per language**. A candidate **cannot be confirmed without both languages present** (parity enforced, product §5).
4. **Confirm top-X** into the level's pool (pool ≥ 20, product §4.0).
5. **Version & publish** the offline bundle (product §5, §8).

**A2 — Monitor parity** — Bilingual parity screen shows coverage per module/level/language; flags gaps (e.g., FR pool below threshold).

**A3 — Watch AI cost** — AI usage screen: tokens / cost / calls per **provider & model** (provider-abstracted, product §10.2).

**A4 — Analytics** — aggregate learning/engagement; per-child accessible to admin (product §9.1, §10.3).

### 6.3 Screen-by-screen

**Login** — role-aware (Admin, Content reviewer — product §10.3). 

**Dashboard** — at-a-glance parity coverage, AI spend this period, pipeline status (drafts pending review, pools below 20). States: Loading, Empty (fresh install).

**Content pipeline** — the workhorse: module/level/lesson selector → generate button → **review table** (candidate, FR text, EN text, FR rating 1–5, EN rating 1–5, confirm). Confirm disabled until both languages rated. Bulk-confirm top-X. Version/publish control with changelog. States: Loading (generation in progress, with token/cost running estimate), Empty (no drafts), Error (generation failed → retry, never lose rated work).

**Bilingual parity** — matrix of module × level × language with coverage counts; cells below threshold flagged. 

**AI usage** — charts/table: tokens, cost, calls, per provider & model, over time; budget framing.

**Analytics** — aggregate dashboards; drill to per-child.

**Users & roles** — manage admins/reviewers and permissions (product §10.3).

### 6.4 Roles & permissions

| Capability | Admin | Content reviewer |
|---|---|---|
| Generate content | ✓ | ✓ |
| Rate & confirm | ✓ | ✓ |
| Version / publish bundle | ✓ | — |
| View AI usage / cost | ✓ | view-only |
| Manage users & roles | ✓ | — |
| View analytics (incl. per-child) | ✓ | ✓ |

---

## 7. Cross-surface flow (the loop that ties it together)

```
Child plays (kid app, maybe offline)
   → events + session_start(initiation_label=null) queue locally
   → sync on launch/session-end/periodic
   → session enters Parent classification queue + ONE digest email
   → Parent labels: child-initiated / prompted / not sure
   → feeds the Adherence signal (product §13.2) and Child insights
Admin generates & reviews bilingual content
   → confirmed pools ship in versioned offline bundles
   → per-language ratings + analytics inform what to regenerate
```

---

## 8. Open UX questions

1. **Profile selection security** — avatar-only pick (simplest for kids) vs. optional parent-set PIN per profile? (Default: avatar-only.)
2. **Avatar UX** — how many AI-suggested options to show; can the child re-roll? (product §3)
3. **Daily-cap copy & moment** — exact wording and whether the parent can grant a one-off extension.
4. **Words sub-mode discovery** — is the sub-mode pick a separate screen or folded into the level map?
5. **Voiceover affordance** (post-MVP) — replay button placement in Keyboard & Translation (product §4.7).
6. **Reduced-text mode** for the youngest non-readers — how far to lean on icons + voiceover before reading is required.

---

## 9. Accessibility & responsive notes

- **Targets** ≥ 56px in the kid app; ≥ 44px on web surfaces.
- **Keyboard-navigable** throughout (the Keyboard module especially); visible focus states.
- **Contrast** per design §4.4 (ink text on ochre/cyan/honey; white elsewhere); body text meets WCAG AA.
- **Never colour-only** — every module/state pairs colour with icon + label.
- **Reduced motion** honoured (design §6.4); celebrations never strobe.
- **Bilingual parity** — every string exists in FR and EN; layouts tolerate length differences.
- **Desktop-first** layouts that degrade gracefully to smaller windows; the kid app assumes a real keyboard/mouse but stays touch-usable.

---

*Source of truth: product-spec-v0.1 (what) + gabee-design-spec (tokens/components). Keep all three in sync.*
