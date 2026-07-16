# Translation Module Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Translation into two separately-tracked sub-modules (FR→EN, EN→FR), make it text-only (drop the image-based L1), and migrate existing kids' progress faithfully from their answer history.

**Architecture:** Follow the existing **Keyboard** two-sub-mode pattern for routing (`keyboard_subhub` + `_static_`/`_scrolling_` lessonmap+session → mirror as `translation_subhub` + `_fr_en_`/`_en_fr_`) and the **Words** pattern for the sub-hub screen + per-sub-mode progress keys. Content lives in `seed-data/translation.json`; progress is JSON on `child_profiles`. A one-off script rebuilds per-direction progress from direction-tagged `question_answered` events.

**Tech Stack:** React 19 + Vite (kid), Next.js 16 + Prisma 7 (web), Zod (`@gabee/types`), `node:test` + `tsx` for unit tests, PostgreSQL.

## Global Constraints

- **Two sub-modes:** `fr-en` and `en-fr` (wire keys), `translation_fr_en` / `translation_en_fr` (progress keys). Never mix — session sampling filters `sub_mode`.
- **MCQ only** — no typing. Question `type` stays `'translation'` (`answer` + `distractors`).
- **Text-only:** L1 must have **zero** `config.image`; L2–L5 unchanged.
- **Faithful migration, no reset:** rebuild per-direction progress from the direction-tagged answer history; `total_stars` never regresses.
- Kid app is **desktop-first**; keep responsive.
- Verify: `pnpm --filter @gabee/types test`, `pnpm --filter @gabee/web exec tsc --noEmit`, `pnpm --filter @gabee/kid exec tsc --noEmit`, `pnpm --filter @gabee/kid build`. Worktree already has `packages/db/.env` — if not, copy it + `prisma generate`.
- Never log PII (this touches kid progress + a prod migration).

---

## File Structure

**Types (`packages/types/src/`):**
- Modify `progress.ts` — swap `translation` for `translation_fr_en` + `translation_en_fr` in `ProgressByModulePerLanguageSchema` + `defaultProgressByModulePerLanguage()`.
- Modify `test/contracts.test.ts` — fixture + assertions for the two keys.

**Content (`packages/db/prisma/seed-data/`):**
- Modify `translation.json` — re-author the 92 L1 items to text (drop `config.image`, add `config.source`, fix `prompt`).
- Create `packages/db/prisma/translation-content.test.mts` — schema guard (sub_mode==direction, L1 no image, mirrored counts).

**Web (`apps/web/src/lib/server/`):**
- Modify `services/progress-merge.ts:103` — two keys.
- Modify `ai/anthropic.ts:204-205` — drop the "L1 use config.image" instruction.
- Create `scripts/migrate-translation-progress.mts` — the reconstruction (dry-run + write).

**Kid (`apps/kid/src/`):**
- Create `screens/TranslationSubhub.tsx` (copy `WordsHub.tsx`).
- Modify `lib/router.ts` — `translation_subhub` + `translation_{fr_en,en_fr}_lessonmap`/`_session` routes; drop `translation_lessonmap`/`translation_summary` flat routes (replace).
- Modify `App.tsx` — replace the flat `translation_*` case block with two-direction wiring (mirror Keyboard).
- Modify `lib/badges.ts`, `lib/nextLesson.ts`, `lib/milestones.ts` — the two progress keys.
- `lib/bundles.ts` unchanged (module list, not per-direction).

---

## Task 1: Progress schema — two per-direction keys

**Files:**
- Modify: `packages/types/src/progress.ts`
- Test: `packages/types/test/contracts.test.ts`

**Interfaces:**
- Produces: `ProgressByModulePerLanguage` gains `translation_fr_en` + `translation_en_fr` (`PerLanguageTrack`), loses `translation`.

- [ ] **Step 1: Update the failing contract test first**

In `packages/types/test/contracts.test.ts`, find the `ChildProfile` test's `progress_by_module_per_language` fixture. Replace its `translation: perLang` entry with:
```ts
        translation_fr_en: perLang,
        translation_en_fr: perLang,
```
Add an assertion in that test:
```ts
    assert.ok('translation_fr_en' in profile.progress_by_module_per_language);
    assert.equal('translation' in profile.progress_by_module_per_language, false);
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @gabee/types test`
Expected: FAIL (schema still requires `translation`, rejects the new keys / the fixture is now invalid).

- [ ] **Step 3: Update the schema**

In `packages/types/src/progress.ts`, in `ProgressByModulePerLanguageSchema` replace:
```ts
  translation: PerLanguageTrackSchema,
```
with:
```ts
  translation_fr_en: PerLanguageTrackSchema,
  translation_en_fr: PerLanguageTrackSchema,
```
And in `defaultProgressByModulePerLanguage()` replace `translation: pair(),` with:
```ts
    translation_fr_en: pair(),
    translation_en_fr: pair(),
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @gabee/types test` → PASS. Then `pnpm --filter @gabee/types exec tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/progress.ts packages/types/test/contracts.test.ts
git commit -m "feat(types): split translation progress into fr_en + en_fr tracks"
```

---

## Task 2: Content — text-only L1 + a content guard

**Files:**
- Modify: `packages/db/prisma/seed-data/translation.json`
- Create: `packages/db/prisma/translation-content.test.mts`
- Modify: `packages/db/package.json` (add a test script if none)

**Interfaces:**
- Produces: `translation.json` where L1 items are text (no `config.image`), still mirror-split, MCQ.

- [ ] **Step 1: Write the content guard (fails on current data)**

Create `packages/db/prisma/translation-content.test.mts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-data', 'translation.json');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const qs: any[] = Array.isArray(raw) ? raw : raw.questions;

test('every question is MCQ, direction-consistent', () => {
  for (const q of qs) {
    assert.equal(q.type, 'translation', `${q.id}: type`);
    assert.ok(Array.isArray(q.distractors) && q.distractors.length >= 1, `${q.id}: distractors`);
    assert.equal(q.config?.direction, q.sub_mode, `${q.id}: sub_mode != direction`);
  }
});

test('L1 is text-only — no images anywhere in translation', () => {
  const withImage = qs.filter((q) => q.config?.image);
  assert.deepEqual(withImage.map((q) => q.id), [], 'these still carry config.image');
});

test('L1 items carry a text source (config.source)', () => {
  const l1 = qs.filter((q) => q.level === 1);
  const missing = l1.filter((q) => !q.config?.source);
  assert.deepEqual(missing.map((q) => q.id), [], 'L1 items missing config.source');
});

test('directions are mirrored per level', () => {
  const count = (d: string, l: number) => qs.filter((q) => q.sub_mode === d && q.level === l).length;
  for (let l = 1; l <= 5; l++) {
    assert.equal(count('fr-en', l), count('en-fr', l), `level ${l} not mirrored`);
  }
});
```
Add to `packages/db/package.json` `scripts` if missing: `"test": "node --import tsx --test 'prisma/**/*.test.mts'"`.

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @gabee/db test`
Expected: FAIL on "L1 is text-only" (92 items still have `config.image`) and "L1 carry config.source".

- [ ] **Step 3: Re-author the 92 L1 items**

Write a one-shot transform (run once, then delete) OR edit the JSON. For each L1 item: remove `config.image`; set `config.source` to the **source-language** word (fr-en → the French word; en-fr → the English word); rewrite `prompt` to a text instruction that references the source, e.g. fr `"Traduis « {source} » en anglais."` / en `"Translate « {source} » into English."` (mirror for en-fr). Keep `answer`, `distractors`, `id`, `curriculum_id` unchanged. The source word must be a genuine simplest/most-frequent concrete word, distinct from L2's set — if the current image key (e.g. `"bed"`) is a usable source word, use its source-language form; otherwise curate. Author/curate all 92 (46/direction, mirrored); keep `status: 'candidate'`.

Transform skeleton (adapt, verify each item reads naturally — do NOT ship machine-mangled prompts):
```bash
node --input-type=module -e '
import fs from "node:fs";
const f="packages/db/prisma/seed-data/translation.json";
const d=JSON.parse(fs.readFileSync(f,"utf8")); const qs=Array.isArray(d)?d:d.questions;
for(const q of qs){ if(q.level!==1) continue;
  const src = /* the source-language word for this item — curate, do not guess from the image key blindly */ q.config.source;
  delete q.config.image;
  q.config.source = src;
  const dir=q.sub_mode; const tgt = dir==="fr-en" ? {fr:"anglais",en:"English"} : {fr:"français",en:"French"};
  q.prompt = { fr:`Traduis « ${src} » en ${tgt.fr}.`, en:`Translate « ${src} » into ${tgt.en}.` };
}
fs.writeFileSync(f, JSON.stringify(qs,null,1));
'
```

- [ ] **Step 4: Run — expect PASS + eyeball**

Run: `pnpm --filter @gabee/db test` → PASS. Then manually read ~6 rewritten L1 items (both directions) to confirm the prompts read naturally and the source words are genuinely L1-easy.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/seed-data/translation.json packages/db/prisma/translation-content.test.mts packages/db/package.json
git commit -m "feat(content): translation L1 becomes text-only + content guard"
```

---

## Task 3: AI content prompt — drop the image instruction

**Files:**
- Modify: `apps/web/src/lib/server/ai/anthropic.ts:204-205`

**Interfaces:** none consumed/produced by others; keeps future AI-generated L1 text-only.

- [ ] **Step 1: Update the prompt**

At `anthropic.ts:204-205`, replace the translation instruction line (currently: "at L1 use config.image (asset key), at L2+ use config.source") with one that never mentions images:
```ts
  translation:
    'translation: config.direction = "fr-en"|"en-fr"; config.source is the source-language word/phrase (L1 = a very common single word, up the ladder to expressions/sentences). `prompt` is a bilingual instruction naming the source; `answer` is the TARGET-language string; distractors are plausible target-language strings. Never use images.',
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @gabee/web exec tsc --noEmit` → 0 errors.
```bash
git add apps/web/src/lib/server/ai/anthropic.ts
git commit -m "feat(ai): translation generation is text-only (no config.image)"
```

---

## Task 4: Kid routing + sub-hub screen

**Files:**
- Create: `apps/kid/src/screens/TranslationSubhub.tsx`
- Modify: `apps/kid/src/lib/router.ts`

**Interfaces:**
- Consumes: `TranslationDirection` from `@gabee/types`.
- Produces: routes `translation_subhub`, `translation_fr_en_lessonmap`/`_session`, `translation_en_fr_lessonmap`/`_session`; `<TranslationSubhub onSubMode onHome onBack>`.

- [ ] **Step 1: Add the routes (mirror Keyboard)**

In `apps/kid/src/lib/router.ts`, in the `KidRoute` union, REPLACE the flat translation routes (`translation_lessonmap`, `translation_summary`, and the `translation_session` if present) with the Keyboard-shaped set:
```ts
  | { name: 'translation_subhub' }
  | { name: 'translation_fr_en_lessonmap'; level: number }
  | ({ name: 'translation_fr_en_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'translation_fr_en_summary'; score: number; total: number } & PlayTarget)
  | { name: 'translation_en_fr_lessonmap'; level: number }
  | ({ name: 'translation_en_fr_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'translation_en_fr_summary'; score: number; total: number } & PlayTarget)
```
Add matching `toPath` cases (mirror keyboard's `/learn/translation/fr-en/...`) and `moduleOf` (any `translation`-prefixed name → `'translation'`, already handled at line 297). In the `SUBHUB` map, set `translation` → `{ name: 'translation_subhub' }` (replace the `translation_levelmap`/`translation_lessonmap` special-case at lines ~213-217, 280, 313). Deep-link parsing: `/learn/translation` → `translation_subhub`; `/learn/translation/fr-en/<level>` → `translation_fr_en_lessonmap`, etc.

- [ ] **Step 2: Create the sub-hub screen (copy WordsHub)**

Create `apps/kid/src/screens/TranslationSubhub.tsx` by copying `WordsHub.tsx` and changing:
```ts
export type TranslationSubMode = 'fr-en' | 'en-fr';
const SUB_MODES: { id: TranslationSubMode; label: { fr: string; en: string }; sub: { fr: string; en: string }; icon: string }[] = [
  { id: 'fr-en', label: { fr: 'FR → EN', en: 'FR → EN' }, sub: { fr: 'Traduis vers l’anglais', en: 'Translate to English' }, icon: '🇫🇷' },
  { id: 'en-fr', label: { fr: 'EN → FR', en: 'EN → FR' }, sub: { fr: 'Traduis vers le français', en: 'Translate to French' }, icon: '🇬🇧' },
];
```
Props mirror WordsHub: `{ onSubMode: (sub: TranslationSubMode) => void; onHome; onBack; }`. Chrome title = the module label ("Traduction"). It reads the translation bundle (`['bundle','translation']`) and shows both directions as playable tiles.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @gabee/kid exec tsc --noEmit`
Expected: errors ONLY in `App.tsx` (the old translation cases no longer match) — Task 5 fixes those. `router.ts` + the new screen compile.

- [ ] **Step 4: Commit**

```bash
git add apps/kid/src/lib/router.ts apps/kid/src/screens/TranslationSubhub.tsx
git commit -m "feat(kid): translation sub-hub + two-direction routes"
```

---

## Task 5: Kid App.tsx — two-direction wiring

**Files:**
- Modify: `apps/kid/src/App.tsx`

**Interfaces:**
- Consumes: routes + `<TranslationSubhub>` (Task 4); `Summary` props incl. `module`, `subLabel`, `onModuleHub`, `onCoffre` (already shipped).

- [ ] **Step 1: Replace the flat translation case block**

Find the current `translation_levelmap` / `translation_lessonmap` / `translation_session` / `translation_summary` cases in `App.tsx`. Replace with the Keyboard-shaped set, one triple per direction. Model each session/summary exactly on the existing keyboard_static block (already correct post the UX batch), substituting the direction:
- `case 'translation_subhub':` → `<TranslationSubhub onSubMode={(sm) => setRoute({ name: sm === 'fr-en' ? 'translation_fr_en_lessonmap' : 'translation_en_fr_lessonmap', level: <first unlocked level> })} onHome={goHome} onBack={goHome} />`
- For each direction `D` in `{ fr_en: 'fr-en', en_fr: 'en-fr' }`:
  - `case 'translation_${D}_lessonmap':` → the lesson map, `onBack` → `translation_subhub`, `onLevel`/lesson picks route to `translation_${D}_session`. The lesson map filters questions by `sub_mode` = the direction; sampling must pass that sub_mode (see how keyboard passes its sub_mode, or how `nextTarget('translation', …, <sub_mode>)` is called — thread the direction as the sub_mode arg).
  - `case 'translation_${D}_session':` → `<TranslationSession direction=<D's 'fr-en'|'en-fr'> … />` (the session already accepts a direction). On finish → `translation_${D}_summary`.
  - `case 'translation_${D}_summary':` → `<Summary module="translation" subLabel={<'FR → EN'|'EN → FR'>} level lesson isRevision onAgain onNext={next ? …translation_${D}_session… : undefined} onHome={goHome} onModuleHub={() => setRoute({ name: 'translation_subhub' })} onCoffre={() => setTab('coffre')} />`. `next` = `nextTarget('translation', route.level, route.lesson, '<direction>')`.
- The module-picker handler that used to route `translation` straight to the level map (`App.tsx:475`) now routes to `translation_subhub`.

Use the exact star/next/onNext shapes already present in the keyboard_static/scrolling summary cases (post-UX-batch) — do not invent new ones.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @gabee/kid exec tsc --noEmit` → 0 errors. Then `pnpm --filter @gabee/kid build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/App.tsx
git commit -m "feat(kid): wire translation two-direction flow through App"
```

---

## Task 6: Progress-key plumbing (badges, nextLesson, milestones, progress-merge)

**Files:**
- Modify: `apps/kid/src/lib/badges.ts`, `apps/kid/src/lib/nextLesson.ts`, `apps/kid/src/lib/milestones.ts`, `apps/web/src/lib/server/services/progress-merge.ts`

**Interfaces:**
- Consumes: the two progress keys (Task 1).

- [ ] **Step 1: progress-merge**

`apps/web/src/lib/server/services/progress-merge.ts:103` — replace `translation: pair('translation'),` with:
```ts
    translation_fr_en: pair('translation_fr_en'),
    translation_en_fr: pair('translation_en_fr'),
```

- [ ] **Step 2: badges**

`apps/kid/src/lib/badges.ts`: the `translation_l1_master` badge (line ~53) — earn it when **either** direction reaches L1-mastery:
```ts
  if (bestL1(perLang.translation_fr_en) >= 3 || bestL1(perLang.translation_en_fr) >= 3) out.add('translation_l1_master');
```
And in the bilingual star-sum loop (line ~59) replace `'translation'` with both `'translation_fr_en', 'translation_en_fr'` in the `trackName` list.

- [ ] **Step 3: nextLesson + milestones**

`apps/kid/src/lib/nextLesson.ts:81-82` — the `case 'translation'` reads `profile.progress_by_module_per_language.translation`; it now needs the direction. This function is called with a module + (for translation) a direction — thread the sub_mode and read `...['translation_' + direction.replace('-','_')]`. Match how `nextTarget`/`nextLesson` already receives keyboard's sub_mode. `apps/kid/src/lib/milestones.ts:50,69` — replace the single `lp.translation[lang]` visit with both direction tracks (visit/note each).

- [ ] **Step 4: Typecheck both packages**

Run: `pnpm --filter @gabee/web exec tsc --noEmit` and `pnpm --filter @gabee/kid exec tsc --noEmit` → 0 errors. `grep -rn "\.translation\b\|'translation'" apps/kid/src apps/web/src/lib/server packages/types/src | grep -v translation_fr_en | grep -v translation_en_fr | grep -viE "module|Traduction|Translate|slug|bundle|sub_mode|'translation'\]|ai/anthropic"` — confirm no stray reads of the old single key remain.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/lib/badges.ts apps/kid/src/lib/nextLesson.ts apps/kid/src/lib/milestones.ts apps/web/src/lib/server/services/progress-merge.ts
git commit -m "feat(progress): thread translation fr_en/en_fr keys through all read/write sites"
```

---

## Task 7: Faithful progress migration (one-off)

**Files:**
- Create: `apps/web/scripts/migrate-translation-progress.mts`

**Interfaces:**
- Consumes: `syncProgress`/progress-recompute logic in `apps/web/src/lib/server/services/progress.ts`.

- [ ] **Step 1: Write the migration (dry-run default)**

Create `apps/web/scripts/migrate-translation-progress.mts` (mirror the dotenv + dynamic-import pattern of the sibling `apps/web/scripts/verify-*.mts`). Logic:
- For each `childProfile`: gather its `question_answered` events where `payload.question_id LIKE 'translation-%'`. Classify each event's direction from the id (`translation-fr-en-...` → `fr-en`, else `en-fr`) — or look up `sub_mode` in the loaded `translation.json` by id.
- For each direction, recompute per `(level, lesson)` the stars/plays from the answers, using the SAME evidence rule as `syncProgress` (reuse its exported helper if one exists; otherwise replicate: a lesson's stars come from its best correct-ratio, bounded, never lowering an existing grant). Build a `PerLanguageTrack` for each direction and write `progress_by_module_per_language.translation_fr_en` / `..._en_fr`. Remove the old `translation` key.
- Fallback: a profile with no events but a populated old `translation` blob → split its `seen_question_ids` by direction and reconstruct from those.
- `total_stars`: recompute the profile's total the same way the app does after the write; assert it is **>=** the pre-migration value (never regress) — if a bug would lower it, abort that profile and report.
- **Default is DRY-RUN**: print, per affected kid, `{ before: {translation levels/stars}, after: {fr_en, en_fr levels/stars}, total_stars_before/after }`. Only write when invoked with `--commit`. Idempotent (re-running produces the same result; safe if `translation` key already gone).

- [ ] **Step 2: Dry-run against the local/staging DB**

Seed a couple of synthetic profiles with known mixed translation answers, run the dry-run, and assert the reconstructed per-direction levels match what those answers should produce. Run: `pnpm --filter @gabee/web exec tsx scripts/migrate-translation-progress.mts` (dry-run) → review output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/migrate-translation-progress.mts
git commit -m "feat(migration): faithful per-direction translation progress rebuild (dry-run default)"
```

- [ ] **Step 4: (deploy-time, NOT in this branch's CI) run for real**

At the release that ships this: after the schema deploy, run `… migrate-translation-progress.mts --commit` against **staging first** (review the printed before/after for the 9 real kids on a prod snapshot), then prod. This is an operational step, recorded here, not a code step.

---

## Self-Review

**Spec coverage:**
- §3.1 structure/sub-hub/routing → Tasks 4, 5. ✓
- §3.2 two progress keys + all read/write sites + badge decision → Tasks 1, 6 (badge: one badge, either direction — matches the spec recommendation). ✓
- §3.3 L1 text-only + L2–L5 unchanged + AI prompt → Tasks 2, 3. ✓
- §3.4 faithful migration from events, dry-run, total_stars never regressed, idempotent → Task 7. ✓
- §5 testing (contract, content guard, migration dry-run) → Tasks 1, 2, 7. ✓
- §6 rollout order → tasks are ordered types → content → AI → routing → App → plumbing → migration. ✓
- §7 open items: badge (resolved to one, Task 6), session route shape (resolved: two routes, mirroring Keyboard, Task 4), L1 sourcing (Task 2 curates). ✓

**Placeholder scan:** Task 2 Step 3 and Task 5 Step 1 are instruction-heavy (content authoring + copy-Keyboard wiring) rather than full literal code — deliberate: the content is 92 curated items (not mechanizable without shipping bad prompts), and the App wiring is "replicate the existing keyboard cases with the direction substituted", with exact route names + prop shapes given. No TBD/we'll-figure-it-out. The transform skeleton is marked "adapt + eyeball", not copy-paste.

**Type consistency:** progress keys `translation_fr_en` / `translation_en_fr` identical across Tasks 1, 6, 7. Route names `translation_subhub` / `translation_{fr_en,en_fr}_{lessonmap,session,summary}` identical across Tasks 4, 5. `TranslationSubMode = 'fr-en' | 'en-fr'` (wire form) vs progress-key form (`fr_en`) — the mapping (`direction.replace('-','_')`) is called out in Task 6 Step 3.
