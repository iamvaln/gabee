# Gabee — Product Specification v0.1

*Name locked: **Gabee** (stylized "Ga-Bee"). A little learning bee. Personal origin (the founder's daughter, Ana Gabrielle) need not be public — it surfaces only in storytelling.*

A bilingual (FR/EN), desktop-first learning tool for ~7-year-olds, a product of Proxia Labs. Five modules covering math, reading, typing, coding, and translation, with 10 levels each and a question pool deep enough that no two sessions feel alike.

---

## 1. Vision & Positioning

A self-paced learning game that supports a 7-year-old's mastery of foundational skills across math, language, typing, coding, and translation. Designed for repeated daily play (10-15 min sessions), it builds confidence via scaffolded progression, varied content, and celebratory milestones.

**Differentiators**
- Bilingual FR/EN from day one
- **Desktop-first** — keyboard and mouse are themselves learning objectives, not just inputs
- Kid app works offline; syncs progress to the parent's web dashboard when online
- Voiceover narration of questions (post-MVP) to support pre-readers
- AI-drafted content reviewed by an admin (and later, educators) before publish
- Per-child activity insights surfaced to the parent on a dedicated web dashboard
- Content grounded in contexts the learner already knows (e.g. local currency in money problems) — without leaning on any single cultural theme

---

## 2. Player & Pedagogical Approach

**Target user**: Children aged 6-8 in **both school subsystems** — the French section (francophone) and the English section (anglophone). Gabee is **fully bilingual and symmetric**: a child can learn in either language and **switch at any time**, continuing their progress in the other. The aim is fluency in both, so there is no "primary" language locked to a profile. Plays on a desktop or laptop computer at home or in a learning setting.

**Why desktop-first**: Learning to use a keyboard and a mouse is one of the explicit learning objectives — the device is part of the curriculum, not just a delivery channel.

**Session shape**: One "game" = 7 questions drawn from a level's question pool. Estimated 3-5 minutes per game. The child typically plays 2-4 games per session.

**Scaffolded 10-level progression** (consistent across modules):
- **L1-3** — Foundation: familiar concepts, confidence-building
- **L4-6** — Combination: mixing what's been learned
- **L7-9** — Application: slightly novel situations
- **L10** — Mastery challenge: rewarding milestone, unlocks a badge

**Failure handling**: No "game over". Wrong answers prompt encouragement and retry. After 3 failed attempts on a question, an optional hint is shown.

**Reward loop**: Stars per correct answer + confetti celebration at level completion + badges at mastery.

---

## 3. Player persona

The player has one persona made of two things: **a name** and **an avatar**. The persona appears as the controllable character in the Code module. The persona has no gameplay effect anywhere else and no behavioral differences between options.

**Name**: free text. At onboarding, the player can either type their own name or pick from four preset names: **Rumi, Léo, Djino, Chloé**.

**Avatar**: a visual character look. Four presets ship at MVP, one matched to each preset name as a default pairing. The player can pair any name with any avatar.

**Customization**
- **MVP**: 4 fixed avatar looks
- **Phase 3**: the child can recolor their avatar — **hair color** and **clothing colors** chosen from a kid-friendly palette. Scope is deliberately limited to recoloring (not part-swapping) to keep it simple and fast.

Avatar visual designs are **AI-suggested** (generated, then picked/refined), keeping art production fast and cheap.

---

## 4. Modules, Levels & Question Pools

### 4.0 Content hierarchy

Each module is structured as a learning path, not a flat bag of questions:

```
Module
 └─ Pedagogical objectives (what the child can do after the whole module)
 └─ Level 1..10
      └─ Level objective (the specific skill of this tier)
      └─ Lesson 1, 2, 3        (each teaches one facet of the level objective)
      │    └─ Question pool (≥ 20 questions per lesson)
      └─ Revision lesson        (samples across the level's 3 lesson pools)
```

- A **lesson** is played as one session: ~7 questions sampled at random from that lesson's pool of ≥ 20, so replays differ.
- A **level** = 3 lessons + 1 revision = 4 sessions. Completing all four (with enough stars) unlocks the next level.
- The exact lesson count (3 + revision) is a working assumption, adjustable per module once we build the first one.

> **Content volume note**: with a lesson layer, the corpus grows. Counting the 4 Words sub-modes as separate tracks: **8 tracks × 10 levels × 3 lessons × 20 questions ≈ 4,800 base questions** (revisions reuse existing pools). This is ~3× the earlier flat estimate and is exactly why the AI generation pipeline (§5) is load-bearing, not a nice-to-have.

The tables below give the **level** progression per module. Lesson breakdowns are defined per module in a separate working pass — Numbers is fully worked out as the template in **Appendix B**.

### 4.1 Numbers module

Scope reaches **200** to match Class 2 expectations (children already count well beyond 20 at this stage).

| Level | Concept |
|-------|---------|
| 1 | Numbers to 20 — count, read, write |
| 2 | Numbers to 100 — tens and units, count, read |
| 3 | Numbers to 200 — count, read, place value |
| 4 | Addition within 20 |
| 5 | Addition within 100 (no carrying, then carrying) |
| 6 | Addition within 200 |
| 7 | Subtraction within 100 |
| 8 | Subtraction within 200 |
| 9 | Comparison & ordering to 200; skip counting (2s, 5s, 10s) |
| 10 | Multiplication intro (×2, ×5, ×10) + mixed mastery to 200 |

### 4.2 Words module — 4 separate sub-modes

The Words zone on the hub opens to a sub-hub with **4 sub-modes**, each with their own 10 levels and pools. They do **not** mix within a single game.

| Sub-mode | Mechanic | L1 → L10 progression |
|----------|----------|----------------------|
| **Picture → word** | See image, pick word from 3-4 options | Single object → adjective → action → 2-word phrase |
| **Fill the blank** | Sentence with one missing word, pick the right one | Subject → verb → object → adverb |
| **Build the sentence** (word cloud) | Drag/tap shuffled words into order | 3-word → 4 → 5 → 6 → 7 → 8 → with punctuation → with conjunction → 2-clause → mastery |
| **Read & answer** | Short story (2-3 sentences) + comprehension question | 1-sentence + literal Q → 2 sentences + literal → 3 sentences + inferential → mastery |

Result: Words has **40 levels total** (4 sub-modes × 10), each with 20+ question pool.

### 4.3 Keyboard module

| Level | Concept |
|-------|---------|
| 1 | Single letters (A-M) |
| 2 | Single letters (N-Z) |
| 3 | 2-letter words |
| 4 | 3-4 letter common words |
| 5 | Longer words (5-7 letters) |
| 6 | 2-word phrases |
| 7 | Short sentences (3-4 words) |
| 8 | Scrolling words (with time pressure) |
| 9 | Scrolling sentences |
| 10 | Mastery (mixed, with punctuation) |

### 4.4 Code module

| Level | Concept |
|-------|---------|
| 1 | One direction, 2-3 moves |
| 2 | Two directions (turn required) |
| 3 | Four directions, longer paths |
| 4 | Obstacles introduced (rocks) |
| 5 | Loop block introduced (repeat 2×) |
| 6 | Loops + obstacles |
| 7 | Multiple stars to collect |
| 8 | Conditional block (if-block) introduced |
| 9 | Multi-step puzzles combining all concepts |
| 10 | Mastery challenge |

### 4.5 Translation module

Every level runs **both directions** — FR → EN *and* EN → FR — for every child. The goal is fluency both ways, regardless of which section the child comes from; the direction is mixed within each level rather than split by level.

| Level | Concept (each level: both FR→EN and EN→FR) |
|-------|---------|
| 1 | Common nouns |
| 2 | More common nouns (everyday objects, animals, food) |
| 3 | Verbs |
| 4 | Adjectives |
| 5 | Numbers and colors |
| 6 | Short expressions (greetings, politeness) |
| 7 | Questions ("où est…", "what is…") |
| 8 | Short sentences |
| 9 | Longer sentences |
| 10 | Mastery (mixed) |

### 4.6 Content volume (with lessons)

Per track: 10 levels × 3 lessons × 20 questions = 600 questions.

- Numbers: **600**
- Words (4 sub-modes): 4 × 600 = **2,400**
- Keyboard: **600**
- Code: **600** puzzle configs
- Translation: **600** pairs

**Total ≈ 4,800 base questions** (revision lessons reuse existing pools). Authoring is the critical path — see §5 (AI pipeline) and §12 (phasing).

### 4.7 Voiceover (audio output)

Voiceover narrates content aloud to support pre-readers and pronunciation learning. **No voice input** from the child.

- **Scope**: primarily the **Keyboard** and **Translation** modules (where hearing the word matters most). Other modules can adopt it later.
- **When it plays**:
  1. When the question appears — the prompt/word is read aloud
  2. On success — the word is read again, followed by a spoken "Bravo !"
- **Controls**: on/off toggle in kid settings (the `audio_enabled` flag). If a child taps/types during narration, narration stops and play continues immediately (never blocks input).
- **Source**: a provided **sample voice** records the sentences — one clear EN voice and one clear FR voice. No accent requirement beyond clear, child-friendly EN/FR. TTS remains a faster fallback if no sample voice is ready.

---

## 5. Question Bank Strategy

**Authoring rules per question**
- Has unique ID
- Belongs to a module → level → lesson → theme
- Has correct answer
- Has ≥ 2 plausible wrong answers (where applicable)
- Has difficulty rating within its level (1-5)
- Has language version(s) FR/EN as applicable
- Tagged with concept(s) for analytics aggregation
- Carries `created_by`, `ratings`, `avg_rating`, `status`

**Storage format**: questions live in the backend database (Postgres), exposed to the kid app as versioned per-module bundles that the service worker caches for offline play.

**Bilingual content assurance**

Bilingual parity is enforced structurally, not left to discipline:
- Every language-dependent text field is stored as a **pair**: `{ fr, en }`. Language-agnostic content (e.g., a bare arithmetic prompt like `23 + 14`) leaves `lang: null` and needs no pair.
- The AI generates **both languages together** in one pass, instructed to **adapt rather than translate literally** — names, currency, and cultural references are localized per language, not word-for-word.
- A question **cannot be confirmed** (move to the live pool) unless both FR and EN versions exist and pass validation. The admin back office surfaces a **language-completeness view** per pool (e.g., "Numbers L5 L2: 18/20 confirmed, 2 missing EN").
- Ratings can be recorded **per language**, so a unit that's strong in French but weak in English gets flagged rather than silently shipped.
- A bilingual (or paired FR + EN) reviewer is assumed at the educator stage; until then the admin reviews both.

**Authoring pipeline**: theme-based generation + rating-based curation. Workflow:
1. Each module/level is organized into **themes**, each with a target pool size *X*
2. Admin asks the AI (Claude API) to generate a batch of candidate questions for a given theme at a given difficulty level
3. Each candidate appears in a review queue. The admin **rates it 1-5**, or **rejects it outright**
4. Once a theme has enough rated candidates, the **top X by rating** are confirmed into the live pool
5. Rejected candidates are discarded; un-confirmed candidates stay available if a confirmed one is later removed

**Curation roadmap** (designed in from the start, not retrofitted):
- **Now**: one admin rates and curates
- **Later**: ratings are collected from **multiple educators** and averaged, so no single person decides quality — the top X is chosen by aggregate score
- **Later still**: **parents** can review and flag specific content they don't want shown to their own child (a per-child content filter, not a global removal)

**Role model**:
- **Admin**: generate, rate, confirm, reject; manage themes and pool targets
- **Educator** (later): rate and edit candidates; no analytics access
- **Parent** (later): flag content for their own child only

The data model carries `created_by`, `ratings: [{rater_id, score}]`, `avg_rating`, and `status` (draft / confirmed / rejected) on every question so each expansion is non-breaking.

**Sampling logic**
- A lesson session samples ~7 questions from that lesson's pool
- Bias away from question IDs the child has seen recently (seen-history tracked per child, synced)
- Never repeat a question within the same session

---

## 6. Gamification & rewards

Gabee is a gamified learning tool, not a themed game. The motivation layer is built from **content-neutral mechanics** that work for any subject (math, language, code, translation) — points, progress, streaks, celebration, achievement. There is **no fictional world or themed economy** (no collectibles, no mascot universe); a theme that narrow would fight the breadth of what Gabee teaches.

### 6.1 Mechanics we use

- **Avatar** — the child's chosen persona and (Phase 3) recolored look. Identity, not theme.
- **Stars** — earned per correct answer. A running score that reads the same in any module.
- **Level progress** — a clear "X of 4 lessons done" indicator; the child sees the path and where they stand.
- **Level completion** — finishing a level is celebrated simply (confetti + the avatar celebrating + "Niveau terminé !"), then the next level unlocks.
- **Badges** — milestone achievements (e.g., completing a whole module). Reward skill, never time spent.
- **Streaks** — consecutive days played. A pure habit mechanic, no fiction attached.

### 6.2 Celebration moments

- **Per correct answer**: instant star + a short encouraging line using the child's name ("Bravo, Gabee !").
- **Per level completed**: confetti burst + the avatar doing a celebratory animation.
- These are kept joyful but lightweight, so they read as a *tool that's fun*, not a game with a plot.

### 6.3 Healthy-use guardrails (built in, not bolted on)

The goal is a **healthy daily ritual**, not maximal time-on-device. We deliberately avoid dark patterns.

- **Daily target, capped**: a small finishable goal (e.g., "aujourd'hui : termine 2 leçons"). When met, Gabee acknowledges it and gently suggests stopping. Beyond the target, play is allowed but unrewarded — no pull to grind.
- **Session soft-limit**: after ~20 minutes of continuous play, a gentle "tu as bien travaillé, fais une pause" nudge. Configurable by the parent.
- **Look-away micro-breaks**: a brief 10-second pause between lessons (eye rest).
- **Parent-set daily time cap**: configured in the parent dashboard; when reached, play pauses until the next day.
- **Explicitly excluded**: variable-ratio "slot-machine" rewards, countdown/FOMO pressure, and streak-loss guilt. A missed streak day pauses the counter and resumes warmly — it never punishes.

---

## 7. Accounts, Profiles, Settings & Onboarding

### 7.1 Account model

- **One parent account** per household — created on the web parent dashboard (email + password, magic link as a future option)
- Each parent account can host **up to 3 child profiles**
- A child profile is not its own account: it has no login. The parent's auth gates access on the kid device, and the kid then picks their profile from a list

### 7.2 Onboarding flows

**Parent first-time setup** (web):
1. Parent signs up on the parent dashboard (email + password)
2. Creates 1-3 child profiles, each with: name, avatar, starting language (switchable anytime)

**Kid device first launch** (desktop):
1. Adult enters parent account credentials once (paired to that device)
2. App downloads the parent's child profiles
3. Welcome animation
4. Kid picks their profile from the available list
5. Short tutorial on the hub

**Kid device subsequent launches**: profile picker → hub. No login required again on that device until logout.

### 7.3 Data model

```
ParentAccount {
  id: uuid
  email: string
  password_hash: string
  created_at, last_login_at
  children: ChildProfile[]  // 0-3
}

ChildProfile {
  id: uuid
  parent_id: uuid
  name: string (2-20 chars)
  avatar: 'rumi' | 'leo' | 'djino' | 'chloe'  // visual look only, no behavioral effect
  avatar_customization: { accessory?, colors?, ... }  // post-MVP
  language: 'fr' | 'en'   // active language; switchable anytime (no locked primary)
  audio_enabled: bool
  created_at, last_active_at
  total_stars: int
  badges: [string]
  // Language-AGNOSTIC modules: one progress track (switching language only changes presentation)
  progress_by_module: {
    numbers:  { highest_level, levels: [{ level, stars, plays, best_time_s, last_played, seen_question_ids: [] }] }
    keyboard: { ... }
    code:     { ... }
  }
  // Language-DEPENDENT modules: progress tracked separately PER language (fr vs en are different skills)
  progress_by_module_per_language: {
    words_picture: { fr: { highest_level, levels: [...] }, en: { highest_level, levels: [...] } }
    words_fill:    { fr: {...}, en: {...} }
    words_build:   { fr: {...}, en: {...} }
    words_read:    { fr: {...}, en: {...} }
    translation:   { fr: {...}, en: {...} }   // "fr" = the FR-side track, "en" = the EN-side track
  }
}
```

> **Switching language** changes presentation everywhere. For the language-agnostic modules the child continues at the same level. For the language-dependent modules they resume *their progress in that language* — which may differ from the other language, by design (reading/vocabulary in FR and EN are distinct skills).

### 7.4 Settings (kid device)

Accessible from the hub gear icon, no PIN required:
- Change name
- Change avatar
- Change language
- Audio (voiceover) on/off
- Switch profile
- Sign out (clears parent auth on this device)

The kid cannot reset their own progress or open the parent dashboard. Those live on the web parent dashboard, behind the parent's password.

---

## 8. Kid app: offline-capable with backend sync

The kid app must keep working without internet (intermittent connectivity is a real constraint for the target users). Sync happens transparently when online.

**Local storage (kid device)**
- IndexedDB for: signed-in parent account ID, child profiles, progress per profile, queued events
- Question banks: bundled with the app build, cached by the service worker

**Service worker**
- Caches all static assets (HTML, JS, CSS, images, audio)
- Caches question bank JSON
- Strategy: cache-first for content, network-first for updates

**Sync to backend**
- On launch, on session_end, and periodically while online: push queued events and progress diffs
- Pull updated question bank versions when a new bundle is available
- Conflict resolution: last-write-wins per field (the kid is the only writer for their own progress; conflicts are rare)
- Session starts logged offline sync on reconnect and surface in the parent's **session classification queue** (§13.2); the parent is nudged by **email** — sent promptly after the sync when possible, otherwise as a daily digest

**Resilience**
- Full session can be played without ever touching the network
- If the parent's auth token expires while offline, the kid keeps playing; sync resumes after re-auth on next online session

---

## 9. Analytics & Learning Insights

### 9.1 Privacy principle

Telemetry is per-child and accessible only to that child's parent (via the parent dashboard) and the admin (in aggregate). GDPR-K aligned. Events are buffered locally on the kid device, then synced to the backend when online.

### 9.2 Module-specific tracking

Not every exercise needs bespoke metrics. The test is whether the skill lives in the **outcome** (right/wrong + time) or in the **process**. Three buckets result:

- **Process-rich** (own events): Typing, Coding, and Build-the-sentence
- **Selection tasks** (one cheap field): Numbers, Picture→word, Fill-the-blank, Translation
- **Reading** (one extra signal): Read & answer

**Keyboard (typing) events** — process-rich

| Event | Properties |
|-------|-----------|
| `typing_keystroke` | level, lesson, question_id, expected_char, typed_char, correct (bool), time_since_prev_ms, position_in_word |
| `typing_word_completed` | level, lesson, question_id, target_text, mode (static/scrolling), total_keystrokes, error_count, error_chars [{expected, typed}], used_backspace (bool), time_to_first_key_ms, duration_ms, completed_before_timeout (scrolling only) |

Derived: accuracy %, chars-per-minute (trends); per-letter error heatmap; self-correction rate; hesitation (time-to-first-key); scrolling completion rate.

**Code events** — process-rich

| Event | Properties |
|-------|-----------|
| `code_run` | level, lesson, program (block sequence), blocks_used, optimal_blocks, result (success/hit_wall/wrong_position), wall_hits, attempt_num, time_since_level_start_ms |
| `code_level_solved` | level, lesson, total_attempts, final_blocks_used, optimal_blocks, efficiency_ratio (optimal/final), used_loop (bool), used_conditional (bool), total_wall_hits, hints_used, duration_ms |

Derived: efficiency (blocks vs. optimal); planning vs. trial-and-error (attempts-to-solve); debugging quality (do attempts converge); concept adoption (loop/conditional use); spatial reasoning (wall-hit trend).

**Build-the-sentence (word cloud) events** — process-rich

| Event | Properties |
|-------|-----------|
| `sentence_build` | level, lesson, question_id, target_sentence, placements (count), removals (count), first_try_success (bool), wrong_positions [index], duration_ms |

Derived: efficiency (placements + removals vs. word count); first-try success rate; **syntax weak spots** (which sentence positions are most often wrong — e.g., verb placement, article order).

**Selection tasks** — cheap enhancement (Numbers, Picture→word, Fill-the-blank, Translation)

No new event. The shared `question_answered` event gains a **`selected_option`** field. Because distractors are *designed*, knowing which wrong one was chosen is a diagnosis, not just a miss. Optionally, each distractor carries an **`error_type`** tag (e.g., `off-by-one`, `place-value`, `semantic-neighbor`, `false-cognate`), so wrong answers roll up by error category.

Derived: error-type breakdown per concept (e.g., "subtraction errors are 70% borrowing mistakes"), confusion pairs (cat↔dog vs. cat↔random).

**Read & answer** — one extra signal

`question_shown` (for reading) gains **`passage_dwell_ms`** — time spent on the story before the question appears. Distinguishes genuine reading from skipping straight to guessing.

### 9.3 Event schema (cross-module)

| Event | Properties |
|-------|-----------|
| `app_launched` | profile_id, locale, ts |
| `session_start` | profile_id, ts, initiation_label (null until the parent classifies: `child_initiated` / `prompted` / `unsure`) |
| `session_end` | profile_id, ts, duration_s, last_screen |
| `lesson_started` | module, sub_mode?, level, lesson, trigger ('new' / 'retry' / 'replay'), position_in_session (1st, 2nd, …) |
| `module_entered` | module, sub_mode?, level, lesson |
| `module_exited` | module, sub_mode?, level, lesson, completed (bool), questions_done, questions_total |
| `question_shown` | module, sub_mode?, level, lesson, question_id, type, attempt_num, passage_dwell_ms (reading only), ts |
| `question_answered` | module, sub_mode?, level, lesson, question_id, correct (bool), selected_option, response_time_ms, attempt_num |
| `question_skipped` | module, sub_mode?, level, lesson, question_id |
| `lesson_completed` | module, sub_mode?, level, lesson, stars, duration_s |
| `level_completed` | module, sub_mode?, level, stars, duration_s |
| `hint_shown` | module, level, lesson, question_id |
| `badge_earned` | badge_id |
| `settings_changed` | field, old_value, new_value |
| `profile_switched` | from_profile_id, to_profile_id |

### 9.4 Derived insights for the parent dashboard

Computed on the backend from the synced event log:

- **Weakness detection**: per concept tag, % correct < 60% over last 20 attempts → flag "needs practice" (plus the typing/coding signals above)
- **Quit pattern**: most common `session_end` last_screen and last module/level/lesson → flag if consistent
- **Time-of-day pattern**: when does the child play most successfully?
- **Streak detection**: consecutive days played
- **Plateau detection**: a level not progressed in N days
- **Pace**: average questions per minute (proxy for engagement)
- **Mastery progression**: per module, levels unlocked over time

### 9.5 Parent-side telemetry

The classification queue (§13.2) is also an instrument on the *parent*. Whether and when a parent classifies is signal — about their willingness to engage, and about when to reach them.

Parent-side events (on the dashboard / email interaction):

| Event | Properties |
|-------|-----------|
| `classification_nudge_sent` | parent_id, channel ('email'), pending_count, ts |
| `nudge_opened` | parent_id, channel, ts (where email opens are trackable) |
| `classification_made` | parent_id, session_id, label, ts, latency_from_nudge_ms |

Derived:
- **Parent willingness**: share of surfaced sessions that get classified, and how it trends over weeks (do they keep it up or drop off?)
- **Response latency**: time from nudge to classification
- **Active window**: the hours a parent actually classifies → feed back into *when the digest is sent* (the send-time optimization loop)
- **Channel effectiveness**: open/act rate of the email nudge

Why it matters: Gabee's parent-facing value (dashboard, insights, eventual monetization) only lands if parents engage at all. Low classification willingness is an early warning that the parent-side proposition needs rethinking — visible well before the richer Phase 2 dashboard is built. It's a **secondary, parent-side** signal — it does not outrank the child-adherence signals in §13, but it reads the other half of the product.

---

## 10. Web companions: Parent dashboard & Admin back office

Two distinct web apps sit on the same backend.

### 10.1 Parent dashboard (web)

Web-only. Parent logs in with email + password. Sees **all of their children** (up to 3) in a consolidated view.

**Views**
- **Session classification queue**: the list of recent session starts awaiting a label, surfaced after the kid device syncs. The parent is nudged by **email** (batched digest, not per session) and taps each: child-initiated / prompted / not sure. Send time adapts to when the parent usually reacts (§9.5).
- **All-kids overview**: a row per child showing today's session time, stars, latest badge, current streak
- **Per-child drilldown**:
  - Today: time played, questions answered, stars earned
  - Module heatmap: 10 levels per module, color-coded by mastery (red < 40%, amber 40-70%, green > 70%). Words and Translation show **two tracks, FR and EN**, since progress there is per-language
  - Weakness list: concrete sentences like "Chloé struggles with subtraction over 10 (45% correct last 14 attempts)"
  - Quit pattern: "5 of her last 7 sessions ended on Coding level 6"
  - Self-initiation: share of sessions labeled child-initiated, alongside the in-app volition signals
  - Streak: "Chloé has played 4 days in a row"
  - Encouragement nudge: suggested play target ("Help her practice subtraction tonight")

**Parent account settings**
- Manage children (add up to 3, edit, archive)
- Change account email / password
- Export per-child progress as PDF (post-MVP)
- Sign out from a specific device

### 10.2 Admin back office (web)

Web-only. Admin (and later, educators) log in via a separate admin auth route.

**Content workspace**
- Theme browser: per module/level, see each theme, its target pool size *X*, and how many confirmed questions it currently holds
- AI generation form: pick a theme + difficulty level + batch size, generate candidates via Claude API
- Rating queue: each candidate shown with a **1-5 rating control** and a **reject** action; candidates can be edited inline before rating
- Confirm step: once a theme has enough rated candidates, one click confirms the **top X by rating** into the live pool
- Pool view: confirmed questions per theme, with the ability to demote one (which re-opens a slot for the next-best candidate)
- **AI usage**: every generation call goes through a provider-abstracted layer (Claude by default, other providers pluggable). Each call records provider, model, token counts, cost, and outcome — surfaced as an **AI usage metric** (cost & volume per model, per time window) so spend stays visible as content scales

**Analytics workspace**
- Aggregate stats across all users: DAU/WAU, retention by cohort, average session, drop-off funnel by module/level
- Question performance: % correct, average response time, skip rate — drives content quality decisions
- **AI usage dashboard**: tokens, cost, and call volume per provider/model over time (from the generation layer above)
- Cohort filters: language, date range

**User management**
- List of parent accounts and their children
- Ability to suspend an account
- Future: invite educators with content-only access

### 10.3 Roles

| Role | Kid app | Parent dashboard | Admin back office |
|------|---------|------------------|-------------------|
| Child | ✓ (their profile) | — | — |
| Parent | — | ✓ (their kids only) + flag content for own child (later) | — |
| Educator (future) | — | — | Rate & edit content only |
| Admin | — | — | Generate, rate, confirm content + analytics + users |

---

## 11. Technical Stack Recommendation

### 11.1 System overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Kid app (PWA)  │     │ Parent dashboard │     │ Admin back office│
│   desktop, offline│    │   (web only)     │     │   (web only)     │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         │  HTTPS/REST            │ HTTPS/REST             │ HTTPS/REST
         └────────────────────────┼────────────────────────┘
                                  │
                         ┌────────▼─────────┐
                         │   Backend API    │
                         │  + Auth + LLM    │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │   PostgreSQL     │
                         └──────────────────┘
```

### 11.2 Per-app stack

| App | Layer | Tech |
|-----|-------|------|
| **Kid app** | Frontend | React + Vite, Tailwind v4 |
| | State | Zustand |
| | Storage | IndexedDB via `idb` |
| | Animations | Framer Motion |
| | Audio (voiceover) | Howler.js |
| | i18n | i18next |
| | Offline | Workbox / Vite PWA plugin |
| **Parent dashboard** | Frontend | React + Vite (or Next.js if SEO needed) |
| | Charts | Recharts or Tremor |
| **Admin back office** | Frontend | React + Vite, Tailwind |
| | Tables | TanStack Table |
| **Backend** | Runtime | Node.js + TypeScript (Hono or Fastify) — shares `packages/types` with the frontends |
| | Auth | Supabase Auth (email + password) |
| | LLM integration | Claude API via a **provider-abstracted layer** (multi-AI ready); **AI usage tracked** (tokens, cost, calls per model) as an admin metric |
| | Database | Supabase (PostgreSQL) |
| | ORM | Prisma (against the Supabase Postgres) |
| **Hosting** | Frontends + API | Vercel |
| | Database + Auth | Supabase |
| | Email | Mailgun (classification digest + transactional) |

**Why kid app stays a PWA**
- Desktop browsers handle PWAs well
- Trivially updatable (no store review)
- Easy install via "Add to home screen" or as a desktop app via Chromium
- Migrate to a native shell (Electron / Tauri) only if a store presence becomes necessary

---

## 12. Roadmap & Phasing

The architecture has four buildable pieces (kid app, backend, parent dashboard, admin back office). Because the **goal of v1 is to learn whether children adhere** — a question only the tracking data can answer — the backend and event pipeline come in **from Phase 1**, not later. What's deferred is *polish* (full authoring UI, full parent dashboard, voiceover), not *measurement*.

### Phase 1 — Playable + measurable (~8-10 weeks)

Goal: real children play, and you can *see* adherence and skill data.

- Kid app: 5 modules, 3 levels each (not 10), 4 fixed avatars, FR + EN. For **Numbers**, the 3 are a **vertical slice — L1 (to 20), L4 (add within 20), L7 (subtract within 100)** — spanning counting + addition + subtraction rather than three contiguous counting levels, so the pilot tests the lesson model across question types and gives kids variety. Other modules take their first 3 levels.
- **Backend from the start**: API + Postgres + auth, event ingestion, profile + progress sync
- **Account model live**: 1 parent account, up to 3 child profiles
- **Full event tracking** including the typing- and coding-specific events (§9.2) — this is the point of Phase 1
- **A minimal data view** for you: even a basic analytics screen (per-child sessions, accuracy, where they quit, typing/coding signals). Doesn't need to be the polished parent dashboard — it needs to show the truth
- Content **seeded directly in the database** (SQL/seed scripts or a thin internal form), since the full AI authoring UI isn't built yet
- Question pool: ~60 per module to seed the corpus, FR + EN

**Exit criteria → the go/no-go decision in §13.** In short: each child returns on ≥ 3 days/week with some of it unprompted, lesson completion is healthy, levels progress, and accuracy improves on replayed content — read together with your qualitative log. Voluntary return (do they come back unprompted) is the make-or-break signal.

### Phase 2 — Admin back office + parent dashboard (~6-8 weeks)

Goal: make content creation and parent visibility first-class.

- Admin back office: theme browser, AI generation form, rating queue, confirm-top-X, language-completeness view
- AI content pipeline operational (Claude API), bilingual generation + review
- Parent dashboard (web): all-kids overview, per-child drilldown, heatmap, weakness list, quit pattern
- Hardened sync, offline edge cases

### Phase 3 — Full content & polish (~6 weeks)

- Expand from 3 levels to 10 levels per module (Numbers to 200, etc.)
- Words sub-modes fully implemented
- Pool size to 20+ per lesson (driven by AI generation + rating)
- Voiceover (Keyboard + Translation) — pro voice talent or quality TTS (see §14)
- Avatar recoloring (hair + clothing)
- Badges, daily target, streaks, session guardrails fully wired
- Advanced insights (plateau, time-of-day), educator role + invite flow

### Phase 4 — Scale (post-launch)

- Multi-educator rating aggregation; parent content flagging
- Adaptive difficulty (level routing driven by per-child performance)
- Native desktop shell (Electron or Tauri) if store presence becomes useful

---

## 13. Success metrics & go/no-go

The Phase 1 pilot answers one question honestly: **do children adhere — come back, stay engaged, and learn — enough to justify continuing?** Metrics and thresholds are defined *before* the pilot runs, so a weak result can't be rationalized after the fact.

### 13.1 North Star

**Weekly active learning days per child** — the number of days in a week on which a child completes at least one lesson. It captures the two things that matter together: that they *come back* (habit) and that they *do the work* (not just open the app). A learning tool lives or dies on habit.

### 13.2 The three signals, in priority order

**1. Adherence — do they come back on their own? (make-or-break)**

This is the dominant signal. It's read from two complementary sources:

- **In-app volition signals (automatic, unbiased)** — derived from the `lesson_started` trigger field:
  - *Retry* after a fail (the child chose to try again)
  - *Replay* of an already-completed lesson or level (they didn't have to)
  - *Continued play* — a 2nd+ lesson in one sitting (`position_in_session` > 1)

  These need no observer, carry no bias, and scale to any cohort size. They answer: *did the child show intrinsic drive within a session?*

- **Session classification (explicit, not inferred)** — answers: *who initiated the session?* Every session start is logged; the parent later labels each one. There is no guessing — a session is either classified or visibly pending, so you always know how much is unresolved. Mechanism:
  1. On the kid device, each session start is recorded (offline-safe — it queues locally)
  2. When the device next syncs, the new session-starts surface to the parent as a **classification queue**, and the parent is nudged by **email** — a batched digest rather than one email per session, to avoid spam. Sent promptly after a sync when online; otherwise as a daily digest. The send time is itself optimizable (see §9.5): learn the hours a parent actually reacts and send the digest then
  3. The parent classifies each session: **child-initiated** ("asked / started on their own"), **prompted** ("I told them to"), or **not sure / someone else**
  - *Honest caveat*: accuracy decays with delay — a session classified days later is harder to remember. Mitigations: send the email close to the sync, batch into a daily digest rather than one-at-a-time, and keep the "not sure" option so the parent is never forced to guess.
  - This explicit queue replaces the earlier inferred approach (it carried an optimistic bias when a prompt went unlogged). It minimizes untracked sessions because each one is a finite, surfaced item to resolve — not an in-the-moment habit that's easily forgotten.

The strongest adherence read combines both: a session the parent labels **child-initiated** *and* in which the app records retries/continuations.

Also tracked: return rate (% of possible days played), retention shape (later weeks vs. week 1 — does it hold after novelty?), sessions per active day.

**2. Engagement quality — do they engage meaningfully? (diagnostic)**
- Lesson completion rate (finished vs. abandoned mid-way) — healthy > ~60-70%
- Session length, read against a healthy band (longer is *not* better, given the anti-fatigue goal)
- Module breadth — touching ≥ 3 of 5 modules; fixation or avoidance flags a problem with *that module*
- Drop-off screen — where sessions consistently end

**3. Learning — are they getting better? (validation)**
- Accuracy trend within a module over repeated play
- Level progression — unlocking vs. stalling
- Skill-specific gains: typing speed/accuracy up, coding efficiency up, syntax weak-spots shrinking (the §9.2 signals)

### 13.3 Go / no-go (after a 3-4 week observation window)

| Outcome | Pattern |
|---------|---------|
| **GO** — build Phase 2 | Sustained adherence beyond week 1 (clear in-app volition: retries/replays/continuations), return rate ≥ ~50% of possible days, completion ≥ ~60%, visible learning progress |
| **ITERATE** — fix, then re-pilot | Mixed: they return but a module is avoided, or they engage but accuracy doesn't improve. Fix the identified issue, then re-pilot |
| **STOP / pivot** | Adherence collapses after the novelty week, or play is externally driven throughout with no in-app volition — fatal for a consumer kids product. Or: play without any learning progress (entertainment, not education) |

Adherence is dominant — if children won't return on their own, nothing downstream matters. Learning validates the tool is worth building. Engagement quality tells you *what* to fix.

### 13.4 The pilot data view

The minimal screen that feeds the decision. Per child, per week, it shows exactly:
1. Active learning days + in-app volition signals (retries / replays / continued sessions) + the **session classification queue** (label each session: child-initiated / prompted / not sure) — **adherence**
2. Lesson completion rate + session length + modules touched + drop-off screen — **engagement**
3. Levels unlocked + accuracy trend + one skill-specific gain — **learning**
4. A free-text observation field per child (joy / frustration / "asked to play")

Alongside these child signals, the pilot also reads **parent willingness** (§9.5) — do parents actually classify sessions, and when? A secondary, parent-side signal: it doesn't gate the child-adherence decision, but weak parent engagement is an early read on the parent-facing half of the product.

If a screen shows those, it's done. Anything richer waits for the Phase 2 parent dashboard.

### 13.5 Honest caveats on method

- **Cohort bias is real.** Any first cohort recruited through personal or professional networks will be friendlier (or harsher) than strangers. A pilot validates *mechanics and learning* well; a true adherence/PMF read needs a cohort of children with no relationship to whoever built it, before any business decision.
- **At small cohort sizes these thresholds are judgment aids, not statistics.** A clear pattern across most children is signal; one outlier is noise. The same metrics become statistically meaningful as the cohort grows.
- **Instrument the qualitative side deliberately.** Voluntary return and emotional response aren't in telemetry — capture them with a simple per-session observation note where the pilot is supervised. Build it in from day one.
- **The leading indicator is voluntary return.** A child choosing to come back, or replaying a lesson they've already cleared, is worth more than any chart. Weight it accordingly.

---

## 14. Open Questions & Decisions Needed

Decisions locked:
- Name: **Gabee**
- Desktop-first (keyboard + mouse are learning objectives)
- Bilingual **EN/FR only** — no further localization or additional-language editions
- Voiceover output (post-MVP), no voice input; read by a provided EN + FR **sample voice**, no accent requirement; TTS as fallback
- Content via an admin back office: AI-drafted + human-reviewed
- 1 parent account, up to 3 child profiles per account
- Parent dashboard web-only, syncs from the kid app
- **Stack**: TypeScript end-to-end · Vercel (frontends + API) · Supabase (Postgres + Auth, email/password) · Prisma · Mailgun (email) · React + Vite + Tailwind
- **Curriculum**: our own scope-and-sequence (not a formal official mapping)
- **Avatars**: AI-suggested designs
- **Monetization**: free (not paid)
- **LLM**: Claude by default, behind a provider-abstracted layer (multi-AI ready); **AI usage tracked** (tokens/cost/calls per model) as an admin metric

Still open:

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| 1 | **Numbers pilot slice** — which 3 of the 10 Numbers levels ship in Phase 1? | Valentine | Phase 1 content |

---

## Appendix A — Glossary

- **Module**: A subject area (Numbers, Words, Keyboard, Code, Translation)
- **Sub-mode**: A distinct exercise type within Words
- **Level**: One of 10 ordered difficulty tiers within a module
- **Game / Session**: One play of 7 questions from a level
- **Pool**: The set of ≥ 20 questions available at a given level
- **Parent account**: One adult login, owns up to 3 child profiles
- **Child profile**: A single child's identity + progress; no login of its own
- **Admin back office**: Web tool for content authoring (AI + review) and analytics
- **Badge**: A persistent reward for reaching a milestone (e.g., L10 mastery)

---

## Appendix B — Numbers module (worked template)

This is the **template** that validates the Module → Level → Lesson → Pool structure before we replicate it to the other tracks. Build and test this one with real children first; adjust the pattern; then apply it.

### B.1 Module pedagogical objectives

By the end of the Numbers module, the child can:
- Count, read, and write numbers up to **200** (with place value: hundreds, tens, units)
- Add within 200 (including carrying)
- Subtract within 200
- Compare and order numbers up to 200 (<, >, =)
- Skip-count by 2s, 5s, and 10s
- Understand multiplication as equal groups (intro: ×2, ×5, ×10)

### B.2 Levels, objectives, and lessons

Each level has 3 lessons (one facet each) + 1 revision (mixes the three). Each lesson draws a 7-question session from its own pool of ≥ 20.

| Level | Level objective | Lesson 1 | Lesson 2 | Lesson 3 | Revision |
|-------|-----------------|----------|----------|----------|----------|
| 1 | Numbers to 20 | Count objects to 20 | Read & write numerals to 20 | Match set ↔ numeral | Mixed to 20 |
| 2 | Numbers to 100 | Tens (10, 20, …, 100) | Tens + units (e.g. 47) | Read & write to 100 | Mixed to 100 |
| 3 | Numbers to 200 | Count past 100 | Place value (H/T/U) | Read & write to 200 | Mixed to 200 |
| 4 | Add within 20 | Add without crossing 10 | Add crossing 10 | Add in a mini word-problem | Mixed |
| 5 | Add within 100 | Add tens | Add 2-digit, no carrying | Add 2-digit, carrying | Mixed |
| 6 | Add within 200 | Add to/over 100 | Carrying into hundreds | Add in context | Mixed |
| 7 | Subtract within 100 | Subtract tens | 2-digit, no borrowing | 2-digit, borrowing | Mixed |
| 8 | Subtract within 200 | Subtract across 100 | Borrowing from hundreds | Subtract in context | Mixed |
| 9 | Compare & order to 200 | Compare (<, >) | Find equal (=) & order | Skip count (2s, 5s, 10s) | Mixed |
| 10 | Multiplication intro + mastery | Equal groups (×2) | ×5 and ×10 | Mixed +/− to 200 | Full mixed |

### B.3 Sample question pool — Level 5, Lesson 2 (Add 2-digit, no carrying)

Target pool size: 20. Below is a representative slice; the live pool continues to 20+ so a 7-question session rarely repeats across plays.

| id | prompt | answer | distractors | difficulty |
|----|--------|--------|-------------|------------|
| num-l5-l2-001 | 23 + 14 | 37 | 35, 47, 27 | 1 |
| num-l5-l2-002 | 35 + 22 | 57 | 55, 47, 67 | 1 |
| num-l5-l2-003 | 41 + 16 | 57 | 55, 47, 67 | 1 |
| num-l5-l2-004 | 52 + 13 | 65 | 63, 55, 75 | 2 |
| num-l5-l2-005 | 34 + 25 | 59 | 57, 49, 69 | 2 |
| num-l5-l2-006 | 61 + 28 | 89 | 87, 79, 99 | 2 |
| num-l5-l2-007 | 13 + 13 | 26 | 23, 16, 36 | 2 |
| num-l5-l2-008 | 45 + 32 | 77 | 75, 67, 87 | 2 |
| num-l5-l2-009 | 26 + 51 | 77 | 75, 67, 87 | 3 |
| num-l5-l2-010 | 72 + 14 | 86 | 84, 76, 96 | 3 |

**Distractor rule** (so AI generation stays consistent, scaled to magnitude): three wrong options, all ≥ 0, no duplicates; for 2-digit answers keep distractors within ±10 of the answer, with at least one being a common error — a ±1 unit slip, or a tens/units place mistake (e.g., adding tens but forgetting units). For single-digit levels, tighten the band to ±3.

### B.4 Question record shape

```
{
  id: "num-l5-l2-001",
  module: "numbers",
  level: 5,
  lesson: 2,
  theme: "addition-2digit-no-carry",
  type: "mcq-number",
  prompt: "23 + 14",
  answer: 37,
  distractors: [35, 47, 27],
  difficulty: 1,
  lang: null,            // bare arithmetic is language-agnostic
  concept_tags: ["addition", "2-digit", "no-carry"],
  created_by: "ai|admin_id",
  ratings: [{ rater_id, score }],
  avg_rating: 4.2,
  status: "confirmed"    // draft | confirmed | rejected
}
```

For language-dependent content (e.g. a Numbers *word problem*), the text fields become bilingual pairs:

```
  prompt: { fr: "Ana a 23 billes, elle en gagne 14. Combien en a-t-elle ?",
            en: "Ana has 23 marbles and wins 14 more. How many does she have?" },
  answer: 37,
  lang: "both"
```

### B.5 How a session runs

1. Child opens Numbers → sees levels 1-10; levels above their highest-unlocked are locked
2. Picks an unlocked level → sees its 3 lessons + revision, with progress ticks
3. Picks a lesson → backend samples 7 questions from that lesson's pool, biased away from recently-seen ids (offline: the cached bundle samples locally)
4. Child plays the 7 → earns stars → lesson marked done; events sync to the backend
5. When all 3 lessons + the revision are done with a passing score, the next level unlocks
