# Translation module rework — design

- **Date:** 2026-07-16
- **Status:** Draft (awaiting review)
- **Author:** Valentine + Claude
- **Area:** kid PWA (`@gabee/kid`), shared types (`@gabee/types`), DB (`@gabee/db`), seed content

## 1. Why

The Translation module ships as a **single flat module** that mixes both
translation directions in one session and tracks them as one. That's wrong on
three counts the product owner raised:

1. It should be **two sub-modules — FR → EN and EN → FR** — played and tracked
   separately.
2. A question from one direction must **never appear** in the other.
3. **Images don't belong in translation.** Translation is words → expressions →
   sentences; the only image-based rung is L1 (`image → mot`), and it should
   become text.

Points 1 & 2 are **already the intended design** — `docs/gabee-curriculum-v0.1.md`
§5 specifies "2 sous-modules = les deux directions, suivies séparément", and the
seed data already tags every question with `sub_mode: 'fr-en' | 'en-fr'` and
`config.direction`. The kid UI just never implemented the split. Point 3 is a
deliberate **curriculum change** from the current spec (whose L1 is image-based).

**Verified facts (audited, not assumed):**
- Content: 556 questions, all `type: 'translation'` (MCQ — `answer` + `distractors`),
  mirror-split `fr-en` (278) / `en-fr` (278), levels 1–5. **All 92 L1 questions
  carry `config.image`; zero L2+ do.** `sub_mode == config.direction` for 100% of
  rows; no language mislabels — so filtering by direction is safe today.
- Prod usage: 19 child profiles, **9 have translation progress**, up to **level 5**.
  Progress is retained as `seen_question_ids` in the blob (9 profiles) and as
  **1288 `question_answered` events across 10 kids**, each carrying the
  direction-bearing `question_id`. So per-direction progress is **faithfully
  reconstructable** — no reset, no guessing.

## 2. Non-goals

- **No new question format.** Stays MCQ (pick the translation). No typing.
- **No re-authoring of L2–L5.** They're already text and correctly graded; only
  L1's 92 image items are replaced.
- **No levels 6–10.** The curriculum's "zone coriace" stays out of scope; this
  rework is L1–L5 across the two directions.
- **No change to voiceover/audio** (a separate parallel branch owns audio).

## 3. Architecture — three parts

### 3.1 Structure & navigation (kid app)

Translation stops being flat and gains a **sub-hub**, mirroring `WordsHub`:

- `translation` tile → **`translation_subhub`** with two cards: **FR → EN**,
  **EN → FR** (reuse the `SUB_MODES` array pattern from `WordsHub.tsx`; labels
  already exist in the seed sub-mode registrations).
- Each card → its own **level map** → level/lesson **session**, all scoped to one
  `sub_mode`. Question sampling filters `sub_mode: 'fr-en' | 'en-fr'`, so
  questions never cross (point 2).
- Router (`apps/kid/src/lib/router.ts`): add `translation_subhub` +
  `translation_fr_en_lessonmap` / `translation_en_fr_lessonmap` +
  `translation_fr_en_session` / `translation_en_fr_session` (or a single
  session route carrying a `direction` field — pick whichever matches how
  Keyboard's two sub-modes are routed, for consistency). Update `SUBHUB`
  resolution so `translation` → `translation_subhub` instead of
  `translation_levelmap`.
- `App.tsx`: replace the single `translation_levelmap`/`translation_session`
  case block with the two-direction wiring; the `TranslationSession` already
  accepts a `TranslationDirection`, so thread the sub-hub's direction into it.

**Inherited for free** from the shipped kid-UX batch: the module context header
(« Traduction · FR → EN · Niveau 2 · Leçon 1 »), direct "next lesson", the
"↩ Traduction" sub-hub return, and the level-complete CTA. The sub-mode labels
for the context header come from the sub-hub's `SUB_MODES` (like Words).

**File shape:** new `apps/kid/src/screens/TranslationSubhub.tsx` (copy `WordsHub`),
new/renamed level-map + session route cases. Keep `TranslationSession.tsx`; only
its entry (direction source) changes.

### 3.2 Progress tracking (two per-direction tracks)

`progress_by_module_per_language` currently has one `translation:
PerLanguageTrackSchema`. Replace it with two keys — `translation_fr_en` and
`translation_en_fr` — each the same `PerLanguageTrackSchema` shape as the four
`words_*` sub-modes (no new type; mappers/sync engine stay uniform).

- `packages/types/src/progress.ts`: swap the `translation` key for the two new
  keys in `ProgressByModulePerLanguageSchema` + `defaultProgressByModulePerLanguage()`.
- Anything that reads/writes the `translation` track (kid `syncProgress`, the
  progress mapper, `earnedBadges`' `translation_l1_master`, the admin/parent
  progress views) is updated to the two keys. Grep `translation` across
  `apps/kid/src/lib`, `apps/web/src/lib/server`, `packages/types` and update each
  site; the badge `translation_l1_master` becomes per-direction (or keep one
  badge that fires when *either* direction hits L1 — decide at plan time, note
  below).

> **Open (plan-time, not a design fork):** does `translation_l1_master`
> stay one badge, or split into two? Recommendation: keep one badge, earned when
> either direction reaches L1-mastery — fewer badges, and the Coffre isn't the
> place to grind both directions. Flag for the implementer.

### 3.3 Curriculum content (L1 → text)

Five levels, all text MCQ, mirrored across both directions:

| L | Content | Change |
|---|---|---|
| L1 | very common words (chat, eau, maison…) | **re-authored** — the 92 `config.image` items replaced by text items (`config.source` = the source word, no image) |
| L2 | broader vocabulary (verbs, adjectives) | unchanged |
| L3 | expressions | unchanged |
| L4 | word groups | unchanged |
| L5 | short sentences | unchanged |

- Edit `packages/db/prisma/seed-data/translation.json`: for the 92 L1 items, drop
  `config.image`, set `config.source` to the source-language word, and update the
  `prompt` from "Translate this word" (image implied) to a text prompt showing
  the source word. Keep `answer` + `distractors` (they're already text). Keep
  ids/curriculum_id stable where possible so the reconstruction (§3.4) and any
  `seen_question_ids` still resolve.
- L1 word list: the easiest, most frequent concrete words, distinct from L2's
  broader set. ~46 items/direction (mirror). Content authored via the existing
  AI-generation path or hand-curated; quality-reviewed like the rest
  (`status: candidate` → confirmed).
- The seed sub-mode `mechanicHint` currently says "config.image (L1) or
  config.source" — update to drop the image mention.

### 3.4 Migration — faithful progress reconstruction (one-off)

Because the old flat track mixed directions, we rebuild the two new tracks from
the **answer history**, which is direction-tagged:

- A one-off script (`packages/db/prisma/` or `apps/web/scripts/`), run once
  against prod: for each child profile, read their translation `question_answered`
  events (1288 total across 10 kids), classify each by direction from the
  `question_id` / `sub_mode`, and recompute per `(direction, level, lesson)` the
  stars/plays exactly as `syncProgress` does from evidence — writing
  `translation_fr_en` + `translation_en_fr`.
- Fallback for a profile with no events but a populated blob: split its
  `seen_question_ids` by direction and reconstruct from those (9 profiles have
  seen-ids; the event count covers 10, so events are the richer source — prefer
  events, fall back to seen-ids).
- `total_stars` is preserved by construction (recomputed stars sum to the same
  or the existing bound; never regressed — mirror `syncProgress`' "bound by
  evidence, never lower an existing grant" rule).
- The migration is **idempotent** and has a **dry-run** mode that prints, per
  kid, the reconstructed per-direction levels/stars for eyeball review before the
  real write. **Verified against a prod snapshot / staging before touching prod.**

## 4. Data flow

Kid picks a direction in the sub-hub → routes to that direction's level map →
session samples questions `WHERE sub_mode = <direction>` → answers emit
`question_answered` events (already direction-tagged) → `syncProgress` writes to
`translation_{fr_en|en_fr}`. Identical to how Words' four sub-modes already flow;
translation just joins the pattern.

## 5. Testing

- **Types contract test**: the two new progress keys parse; the old `translation`
  key is gone (a fixture with it should now fail / be migrated).
- **Content guard** (node:test, schema-only, CI-safe): assert every
  `translation.json` question has `sub_mode == config.direction`, L1 has **no**
  `config.image` (the whole point), and each level's item count is mirrored
  across directions. This locks the rework in and catches a regression in
  authoring.
- **Migration**: dry-run output reviewed on staging; a scripted check that a
  synthetic kid with known mixed answers reconstructs into the expected
  per-direction levels.
- **Kid tsc + build**; manual walkthrough of both directions end to end
  (desktop-first).

## 6. Rollout order

1. Types + progress schema (two keys) + contract test.
2. Content: L1 re-author + content guard.
3. Kid app: sub-hub + routing + session direction + progress writes.
4. Migration script (dry-run → staging → prod), run at deploy.
5. Manual walkthrough.

Migration runs **once at the deploy that ships this**; until then prod keeps the
old flat track, so the script must read the old shape and write the new — order
it after the schema change is deployed but as part of the same release.

## 7. Open items (plan-time)

- One `translation_l1_master` badge vs two (recommendation: one — §3.2).
- Session route shape: two session routes vs one with a `direction` field —
  match Keyboard's precedent for consistency.
- L1 word list sourcing: AI-generate vs hand-curate (either is fine; both get the
  same quality review).
