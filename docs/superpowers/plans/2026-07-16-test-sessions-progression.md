# Sessions & Progression Unit Tests (Phase 4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock in the kid-side session-runtime rules (level-first ordering, already-seen dedup, the two-threshold star gating, resume keying) with pure `node:test` unit tests — the `progression.ts` / `nextLesson.ts` / `selectSession.ts` / `sessionResume.ts` cluster the spec names for phase 4.

**Architecture:** Phase 4 of `docs/superpowers/specs/2026-07-14-test-strategy-design.md` (Layer 1 unit + Layer 4 e2e), split in two: **4a (this plan)** = the unit tests for the four session-runtime modules; **4b (next plan)** = the "one-session-per-module" kid e2e. These four modules have ZERO tests today. They are (almost entirely) pure functions, so tests are plain `apps/kid/src/lib/*.test.ts` following the existing `guide.test.ts`/`turtle.test.ts` convention (`describe`/`it` from `node:test`, `assert` from `node:assert/strict`, no DOM setup import), auto-discovered by the kid `test` script's `find src -name '*.test.ts'` glob. The one localStorage-backed module (`sessionResume.ts`) gets a `*.test.tsx` DOM-suite file instead (jsdom provides `localStorage`).

**Tech Stack:** node:test via tsx (NOT Vitest), `node:assert/strict`, `@gabee/types` progress schemas for fixtures. No production code changes, no new deps, no package.json/turbo changes (glob discovery already in place).

## Global Constraints

- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule).
- **Zero production code changes.** Test-only phase. If a test can't be written without changing source, STOP and report (a real bug found is a STOP-and-report, like phases 2-3).
- **Test file conventions (kid):** `*.test.ts` = pure logic, run by `pnpm --filter @gabee/kid run test` (`find src -name '*.test.ts'`, no DOM). `*.test.tsx` = DOM suite, run by `pnpm --filter @gabee/kid run test:dom` (first import `import './../test/setup-dom'`, which sets up jsdom + `localStorage`). New files are auto-discovered by the globs — NO package.json edit needed. Follow `apps/kid/src/lib/guide.test.ts` for the pure convention and `apps/kid/src/lib/db.queues.test.tsx` for the DOM convention.
- **The two star thresholds are DELIBERATE and must both be pinned** (they are the load-bearing rules of this phase): `progression.unitPassed`/`levelComplete` treat a unit as passed at **stars ≥ 1** (level-completion / unlock gate); `nextLesson.pickNextLesson` treats a unit as "done" only at **stars ≥ 3** (auto-advance mastery gate). A test that conflates them defeats the point.
- **`selectSession` shuffles within each tier via `Math.random`** — assert set MEMBERSHIP, COUNTS, and TIER PRIORITY (which tier each result came from), never exact order. Construct disjoint, deliberately-sized tiers so priority is observable from the result set alone (no `Math.random` stubbing needed).
- Pure-logic tests must stay fast (they run in the <30s pre-push budget). No sleeps, no I/O.
- Node 20, pnpm, repo root = worktree root. Branch `feature/test-sessions-progression` off `origin/main`.

---

### Task 0: Branch

- [ ] **Step 1:** Worktree/branch `feature/test-sessions-progression` off `origin/main` (handled by worktree tooling; verify `git status -sb`). Fresh worktrees need `packages/db/.env` + `pnpm --filter @gabee/db run db:generate` before builds (kid unit tests don't need the DB, but typecheck of the workspace may).

---

### Task 1: `progression.ts` unit tests

**Files:**
- Test: `apps/kid/src/lib/progression.test.ts`

**Interfaces:**
- Consumes: `sortedUnique`, `lessonsForLevel`, `unitsForLevel`, `findLevelProgress`, `unitPassed`, `levelComplete`, and the `PlayUnit` type from `./progression`; `LevelProgress`/`LessonProgress` shapes from `@gabee/types`.
- Produces: the `lvl(...)`/`lesson(...)` fixture-builder pattern later tasks reuse inline.

**Rules to pin (from source, verified):** `LESSONS_PER_LEVEL = 3`, `REVISION_LESSON = 4`. `lessonsForLevel(qs, level)` → `[1,2,3]` if any `q.level === level` else `[]` (does NOT read `q.lesson`). `unitsForLevel(nums)` → one non-revision unit per num, PLUS a `{lesson:4, isRevision:true}` unit appended ONLY when `nums.length >= 2`. `unitPassed` = the unit's `LessonProgress.stars >= 1`. `levelComplete` = `units.length > 0 && every unit passed`.

- [ ] **Step 1: Write the test**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sortedUnique,
  lessonsForLevel,
  unitsForLevel,
  findLevelProgress,
  unitPassed,
  levelComplete,
} from './progression';

// Minimal LevelProgress/LessonProgress fixtures (only the fields these fns read).
function lesson(n: number, stars: number) {
  return { lesson: n, stars, plays: 1, last_played: null };
}
function lvl(level: number, lessons: ReturnType<typeof lesson>[]) {
  return { level, stars: 0, plays: 0, best_time_s: null, last_played: null, seen_question_ids: [], lessons };
}

describe('sortedUnique', () => {
  it('dedupes and sorts ascending', () => {
    assert.deepEqual(sortedUnique([3, 1, 2, 1, 3]), [1, 2, 3]);
    assert.deepEqual(sortedUnique([]), []);
  });
});

describe('lessonsForLevel', () => {
  it('returns [1,2,3] when the level has any question, else []', () => {
    const qs = [{ level: 1 }, { level: 1 }, { level: 2 }];
    assert.deepEqual(lessonsForLevel(qs, 1), [1, 2, 3]);
    assert.deepEqual(lessonsForLevel(qs, 2), [1, 2, 3]);
    assert.deepEqual(lessonsForLevel(qs, 3), []); // no questions at level 3
  });
});

describe('unitsForLevel', () => {
  it('appends a revision unit only when there are >= 2 lessons', () => {
    assert.deepEqual(unitsForLevel([1, 2, 3]), [
      { lesson: 1, isRevision: false },
      { lesson: 2, isRevision: false },
      { lesson: 3, isRevision: false },
      { lesson: 4, isRevision: true },
    ]);
    assert.deepEqual(unitsForLevel([1]), [{ lesson: 1, isRevision: false }]); // no revision
    assert.deepEqual(unitsForLevel([]), []); // no lessons, no revision
  });
});

describe('findLevelProgress', () => {
  it('finds by level or returns undefined', () => {
    const levels = [lvl(1, []), lvl(2, [])];
    assert.equal(findLevelProgress(levels, 2)?.level, 2);
    assert.equal(findLevelProgress(levels, 9), undefined);
  });
});

describe('unitPassed (>= 1 star gate)', () => {
  it('is true at 1 star, false at 0', () => {
    const levels = [lvl(1, [lesson(1, 1), lesson(2, 0)])];
    assert.equal(unitPassed(levels, 1, 1), true);
    assert.equal(unitPassed(levels, 1, 2), false);
    assert.equal(unitPassed(levels, 1, 3), false); // missing lesson row → 0 stars
    assert.equal(unitPassed(levels, 9, 1), false); // missing level
  });
});

describe('levelComplete', () => {
  it('is true only when every unit is passed (>= 1 star each)', () => {
    const units = unitsForLevel([1, 2, 3]); // lessons 1,2,3 + revision 4
    const allPassed = [lvl(1, [lesson(1, 1), lesson(2, 2), lesson(3, 1), lesson(4, 1)])];
    const oneMissing = [lvl(1, [lesson(1, 1), lesson(2, 2), lesson(3, 1), lesson(4, 0)])];
    assert.equal(levelComplete(allPassed, 1, units), true);
    assert.equal(levelComplete(oneMissing, 1, units), false);
    assert.equal(levelComplete(allPassed, 1, []), false); // empty units → not complete
  });
});
```

- [ ] **Step 2: Run** — `cd apps/kid && node --import tsx --test src/lib/progression.test.ts` → all pass. Any failure against the real functions = STOP and report (source bug). Then full pure suite: `pnpm --filter @gabee/kid run test` (glob auto-picks it up; everything green).

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/lib/progression.test.ts
git commit -m "test(kid/progression): pin unit/level model — lessonsForLevel, revision rule, 1-star pass gate, levelComplete"
```

---

### Task 2: `nextLesson.ts` unit tests (the auto-advance algorithm)

**Files:**
- Test: `apps/kid/src/lib/nextLesson.test.ts`

**Interfaces:**
- Consumes: `pickNextLesson`, `subModeHint`, `nextLessonFor`, `NextLesson`/`SubModeHint` types from `./nextLesson`.
- Produces: nothing downstream.

**Rules to pin (verified):** `pickNextLesson(bundle, levels, subMode=null)` returns `null` when `bundle==null` or the sub-mode-filtered pool is empty; otherwise walks configured levels (`sortedUnique(pool.map(q=>q.level))`) ascending, and within each the units (`unitsForLevel(lessonsForLevel(pool, level))`) in order, returning the FIRST unit whose `stars < 3` (the **3-star** mastery gate — distinct from progression's 1-star gate). Returns `null` when everything is ≥3-starred. `subModeHint`: `hasProgress = any lesson stars >= 1`; `null` next → `'done'` if hasProgress else `'start'`; non-null next → `'resume'{level}` if hasProgress else `'start'`.

- [ ] **Step 1: Write the test**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickNextLesson, subModeHint, nextLessonFor } from './nextLesson';

function q(level: number, sub_mode: string | null = null) {
  return { level, sub_mode, id: `q-${level}-${sub_mode ?? 'x'}-${Math.random()}` };
}
function lesson(n: number, stars: number) {
  return { lesson: n, stars, plays: 1, last_played: null };
}
function lvl(level: number, lessons: ReturnType<typeof lesson>[]) {
  return { level, stars: 0, plays: 0, best_time_s: null, last_played: null, seen_question_ids: [], lessons };
}

describe('pickNextLesson', () => {
  it('returns null for a null bundle or an empty (sub-mode-filtered) pool', () => {
    assert.equal(pickNextLesson(null, []), null);
    assert.equal(pickNextLesson({ questions: [q(1, 'picture')] }, [], 'fill'), null); // no 'fill' questions
  });

  it('fresh progress → first unit of the lowest configured level', () => {
    const bundle = { questions: [q(1), q(1), q(2)] };
    assert.deepEqual(pickNextLesson(bundle, []), { level: 1, lesson: 1, isRevision: false });
  });

  it('skips units that are fully 3-starred, within a level, in unit order', () => {
    const bundle = { questions: [q(1)] };
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 1)])]; // L1 lesson1 mastered, lesson2 not
    assert.deepEqual(pickNextLesson(bundle, levels), { level: 1, lesson: 2, isRevision: false });
  });

  it('is LEVEL-FIRST: an unfinished lower level is chosen before a higher one', () => {
    const bundle = { questions: [q(1), q(2)] };
    const levels = [lvl(1, [lesson(1, 0)]), lvl(2, [lesson(1, 0)])];
    assert.equal(pickNextLesson(bundle, levels)!.level, 1); // never jumps to level 2 while level 1 is open
  });

  it('advances to the next level only once every unit of the lower level is 3-starred', () => {
    const bundle = { questions: [q(1), q(2)] };
    // L1 lessons 1,2,3 + revision(4) all at 3 stars → L1 fully mastered
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 3)]), lvl(2, [lesson(1, 0)])];
    assert.deepEqual(pickNextLesson(bundle, levels), { level: 2, lesson: 1, isRevision: false });
  });

  it('returns null when every unit of every configured level is 3-starred', () => {
    const bundle = { questions: [q(1)] };
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 3)])];
    assert.equal(pickNextLesson(bundle, levels), null);
  });

  it('the revision unit (lesson 4) is the last one picked in a level', () => {
    const bundle = { questions: [q(1)] };
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 0)])];
    assert.deepEqual(pickNextLesson(bundle, levels), { level: 1, lesson: 4, isRevision: true });
  });
});

describe('subModeHint', () => {
  const bundle = { questions: [q(1, 'picture')] };
  const profileWith = (lessons: ReturnType<typeof lesson>[]) =>
    ({
      id: 'p1',
      progress_by_module_per_language: { words_picture: { fr: { highest_level: 1, levels: lessons.length ? [lvl(1, lessons)] : [] }, en: { highest_level: 1, levels: [] } } },
    }) as never;

  it("'start' when there is no progress", () => {
    assert.deepEqual(subModeHint(bundle, profileWith([]), 'words', 'picture', 'fr'), { kind: 'start' });
  });
  it("'resume' with the level when progress exists and more remains", () => {
    assert.deepEqual(subModeHint(bundle, profileWith([lesson(1, 1)]), 'words', 'picture', 'fr'), { kind: 'resume', level: 1 });
  });
  it("'done' when there is progress and nothing remains (all 3-starred)", () => {
    const full = [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 3)];
    assert.deepEqual(subModeHint(bundle, profileWith(full), 'words', 'picture', 'fr'), { kind: 'done' });
  });
});

describe('nextLessonFor', () => {
  it('reads the words per-language track and delegates to pickNextLesson', () => {
    const bundle = { questions: [q(1, 'picture')] };
    const profile = {
      id: 'p1',
      progress_by_module_per_language: { words_picture: { fr: { highest_level: 1, levels: [lvl(1, [lesson(1, 3), lesson(2, 0)])] }, en: { highest_level: 1, levels: [] } } },
    } as never;
    assert.deepEqual(nextLessonFor(bundle, profile, 'words', 'picture', 'fr'), { level: 1, lesson: 2, isRevision: false });
  });
});
```

- [ ] **Step 2: Verify the fixture shapes against source first.** Read `nextLesson.ts` `getProgressLevels` (~line 66) for the EXACT profile field path per module — `words` uses `progress_by_module_per_language['words_' + subMode][lang].levels`; confirm the key is `words_picture` (not `words:picture`) and the per-language `.fr`/`.en` nesting. Align the `subModeHint`/`nextLessonFor` fixtures to the real path (the `pickNextLesson` tests don't depend on this — they pass `levels` directly). Do NOT test the `'code'` module here (it reads localStorage — belongs to the DOM suite / phase-4b); the pure branches (words/translation/numbers/keyboard) are enough.

- [ ] **Step 3: Run** — `cd apps/kid && node --import tsx --test src/lib/nextLesson.test.ts` → all pass, then `pnpm --filter @gabee/kid run test`. Failure against real behavior = STOP and report.

- [ ] **Step 4: Commit**

```bash
git add apps/kid/src/lib/nextLesson.test.ts
git commit -m "test(kid/nextLesson): pin auto-advance — level-first ordering, 3-star mastery gate, revision-last, subModeHint states"
```

---

### Task 3: `selectSession.ts` unit tests (level-first selection + dedup)

**Files:**
- Test: `apps/kid/src/lib/selectSession.test.ts`

**Interfaces:**
- Consumes: `selectSession` from `./selectSession`.
- Produces: nothing downstream.

**Rule to pin (verified):** `selectSession(pool, age, total, seen?)` concatenates 4 shuffled tiers in priority order — (1) unseen∩in-band, (2) unseen∩out-of-band, (3) seen∩in-band, (4) seen∩out-of-band — then slices to `total`. `inBand` is true when `age==null` OR the question's `[age_min, age_max]` (nullable bounds) contains `age`. Never throws when `pool.length < total` (returns the whole pool). Assertions are membership/count/tier-priority only (within-tier order is `Math.random`).

- [ ] **Step 1: Write the test**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectSession } from './selectSession';

function item(id: string, age_min: number | null = null, age_max: number | null = null) {
  return { id, age_min, age_max };
}
const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));

describe('selectSession', () => {
  it('returns `total` distinct items when the pool is large enough', () => {
    const pool = Array.from({ length: 10 }, (_, i) => item(`q${i}`));
    const out = selectSession(pool, null, 7);
    assert.equal(out.length, 7);
    assert.equal(ids(out).size, 7); // all distinct
    for (const q of out) assert.ok(pool.some((p) => p.id === q.id)); // all from the pool
  });

  it('returns the whole pool (no throw) when the pool is smaller than total', () => {
    const pool = [item('a'), item('b')];
    const out = selectSession(pool, null, 7);
    assert.equal(out.length, 2);
    assert.deepEqual(ids(out), new Set(['a', 'b']));
  });

  it('prioritizes UNSEEN over seen (dedup): unseen fill first', () => {
    const unseen = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const seen = ['s1', 's2', 's3', 's4', 's5'];
    const pool = [...unseen, ...seen].map((id) => item(id));
    const out = selectSession(pool, null, 7, new Set(seen));
    const outIds = ids(out);
    // all 5 unseen present, exactly 2 seen fill the remainder (unseen tier drained first)
    for (const u of unseen) assert.ok(outIds.has(u), `expected unseen ${u}`);
    assert.equal([...outIds].filter((id) => seen.includes(id)).length, 2);
  });

  it('prioritizes IN-AGE-BAND over out-of-band within the unseen tier', () => {
    const inBand = ['i1', 'i2', 'i3', 'i4', 'i5'].map((id) => item(id, 5, 7)); // age 6 is in [5,7]
    const outBand = ['o1', 'o2', 'o3', 'o4', 'o5'].map((id) => item(id, 8, 10)); // age 6 not in [8,10]
    const out = selectSession([...inBand, ...outBand], 6, 7);
    const outIds = ids(out);
    for (const q of inBand) assert.ok(outIds.has(q.id), `expected in-band ${q.id}`);
    assert.equal([...outIds].filter((id) => id.startsWith('o')).length, 2); // only 2 out-of-band fill
  });

  it('age == null puts every question in-band (no age filtering)', () => {
    const pool = [item('a', 8, 10), item('b', 3, 5)];
    const out = selectSession(pool, null, 7);
    assert.deepEqual(ids(out), new Set(['a', 'b'])); // both served regardless of bands
  });

  it('repeats (seen items) only appear once the unseen pool is exhausted', () => {
    const unseen = ['u1', 'u2'];
    const seen = ['s1', 's2', 's3'];
    const pool = [...unseen, ...seen].map((id) => item(id));
    const out = selectSession(pool, null, 7, new Set(seen)); // total(7) > pool(5) → whole pool
    // both unseen present; seen only fill after unseen are used
    assert.ok(ids(out).has('u1') && ids(out).has('u2'));
  });
});
```

- [ ] **Step 2: Run** — `cd apps/kid && node --import tsx --test src/lib/selectSession.test.ts` → all pass (run it 2× to be sure the shuffle non-determinism doesn't break any assertion — every assertion here is membership/count based, so it must be stable across runs). Then `pnpm --filter @gabee/kid run test`.

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/lib/selectSession.test.ts
git commit -m "test(kid/selectSession): pin level-first selection tiers — unseen>seen, in-band>out, total-slice, small-pool"
```

---

### Task 4: `sessionResume.ts` unit tests (key + localStorage round-trip)

**Files:**
- Test: `apps/kid/src/lib/sessionResume.test.tsx` (DOM suite — `loadResume`/`clearResume` need `localStorage`, which jsdom provides)

**Interfaces:**
- Consumes: `sessionResumeKey`, `loadResume`, `clearResume`, `SessionProgress` from `./sessionResume`.
- Produces: nothing downstream.

**Rules to pin (verified):** `sessionResumeKey(profileId, track, level, lesson)` = `` `gabee:resume:${profileId ?? 'anon'}:${track}:${level}:${lesson}` ``. `loadResume(key)` reads+parses localStorage, returns the value only when `typeof qIdx === 'number' && typeof score === 'number' && qIdx >= 0`, else `null` (and `null` on missing/garbage). `clearResume(key)` removes the key. (The `useResumableProgress` React hook is deferred to phase 4b — testing a hook needs render infra the kid DOM suite doesn't currently set up; note this in your report.)

- [ ] **Step 1: Write the test** — `sessionResume.test.tsx` (DOM suite, first import is the jsdom setup):

```tsx
import './../test/setup-dom'; // MUST be first: jsdom provides localStorage
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sessionResumeKey, loadResume, clearResume } from './sessionResume';

beforeEach(() => localStorage.clear());

test('sessionResumeKey builds the namespaced key (anon when profileId is null)', () => {
  assert.equal(sessionResumeKey('p1', 'words:picture', 2, 3), 'gabee:resume:p1:words:picture:2:3');
  assert.equal(sessionResumeKey(null, 'numbers:counting', 1, 1), 'gabee:resume:anon:numbers:counting:1:1');
});

test('loadResume returns null for a missing key', () => {
  assert.equal(loadResume('gabee:resume:none'), null);
});

test('loadResume round-trips a valid saved SessionProgress', () => {
  const key = sessionResumeKey('p1', 'words:picture', 1, 1);
  localStorage.setItem(key, JSON.stringify({ qIdx: 3, score: 2 }));
  assert.deepEqual(loadResume(key), { qIdx: 3, score: 2 });
});

test('loadResume rejects malformed / out-of-range payloads', () => {
  const key = 'gabee:resume:p1:t:1:1';
  localStorage.setItem(key, 'not json');
  assert.equal(loadResume(key), null);
  localStorage.setItem(key, JSON.stringify({ qIdx: -1, score: 0 })); // qIdx must be >= 0
  assert.equal(loadResume(key), null);
  localStorage.setItem(key, JSON.stringify({ qIdx: 1 })); // missing score
  assert.equal(loadResume(key), null);
});

test('clearResume removes the saved progress', () => {
  const key = sessionResumeKey('p1', 'words:picture', 1, 1);
  localStorage.setItem(key, JSON.stringify({ qIdx: 1, score: 1 }));
  clearResume(key);
  assert.equal(loadResume(key), null);
});
```

- [ ] **Step 2: Run** — `cd apps/kid && node --import tsx --test --test-force-exit src/lib/sessionResume.test.tsx` → all pass, then the full DOM suite `pnpm --filter @gabee/kid run test:dom` (glob auto-discovers it; everything green, output pristine). Confirm `loadResume`/`clearResume` reference `localStorage` in a way jsdom satisfies — if they use a bare `localStorage` global that jsdom's setup exposes, this works; if a hunk fails on an undefined global, check `apps/kid/src/test/setup-dom.ts` exposes `localStorage` (jsdom via global-jsdom does) and report if not.

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/lib/sessionResume.test.tsx
git commit -m "test(kid/sessionResume): pin resume key + localStorage load/clear round-trip + payload validation"
```

---

### Task 5: Full pipeline + PR

- [ ] **Step 1: Full local pipeline**

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration
```
Expected: everything green (kid `test` grew by 3 `*.test.ts` files, `test:dom` by 1 `*.test.tsx`). Lint may keep its pre-existing warnings; any FAILURE = STOP and report. (e2e is unaffected; not required for this unit-only phase, but CI will run it.)

- [ ] **Step 2: Push and PR**

```bash
git push -u origin feature/test-sessions-progression
gh pr create --base main --title "test(sessions): phase 4a — progression/nextLesson/selectSession/sessionResume unit tests" --body "Implements phase 4a of docs/superpowers/specs/2026-07-14-test-strategy-design.md (sessions & progression, unit layer) — the four session-runtime modules had zero tests.

- progression: lessonsForLevel, the revision-unit rule (revision only when >= 2 lessons), unitPassed/levelComplete at the 1-star pass gate
- nextLesson: the auto-advance algorithm — level-first ordering, the 3-star mastery gate (deliberately distinct from progression's 1-star gate), revision-last within a level, null-when-mastered, subModeHint start/resume/done
- selectSession: the level-first selection tiers — unseen before seen (dedup), in-age-band before out-of-band, total-slice, small-pool no-throw
- sessionResume: resume key namespacing + localStorage load/clear round-trip + payload validation

Pure node:test unit tests (no DOM) except sessionResume (DOM suite for localStorage). Zero production changes. Phase 4b (one-session-per-module kid e2e) is planned next."
```

- [ ] **Step 3: Watch CI to green** — `gh run list --branch feature/test-sessions-progression --limit 1`, then `gh run watch <id> --exit-status`. Both `check` and `e2e` jobs must pass. Iterate on failures; never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 4a):** the Layer-1 progression cluster ✔ — `progression.ts` (Task 1), `nextLesson.ts` (Task 2), `selectSession.ts` (Task 3), `sessionResume.ts` (Task 4), encoding the two rules the spec names (level-first ordering, already-seen dedup) plus the two-threshold star gating. `nextLesson.ts` — named in the Layer-1 bullet though not in the Sequencing line — is included. The "one-session-per-module e2e" is deliberately deferred to plan 4b (declared in Architecture). `session.ts` (lifecycle/telemetry) is correctly out of scope — it is not session-COMPOSITION; `selectSession.ts` is the composer.
- **Placeholders:** none — every step has runnable test code + commands. Task 2 Step 2 names the exact source path to verify the profile-field fixture shape before running; the `pickNextLesson` assertions (which pass `levels` directly) don't depend on it.
- **Type consistency:** fixture builders (`lvl`/`lesson`/`item`/`q`) are self-contained per file; the `LevelProgress`/`LessonProgress` field set matches `@gabee/types` (`level/stars/plays/best_time_s/last_played/seen_question_ids/lessons`; `lesson/stars/plays/last_played`). The two star thresholds (1 vs 3) are asserted in their respective files and never conflated.
- **Known risk register:** (1) `selectSession` shuffle non-determinism — every assertion is membership/count/tier-priority, stable across runs (Task 3 runs 2×); (2) profile-field path for words/per-language tracks — Task 2 Step 2 verifies against source; (3) `sessionResume` localStorage availability under jsdom — DOM suite + a source check; (4) the `useResumableProgress` hook + the `code` module's localStorage track are deferred (need render/DOM infra) — noted, not silently dropped.
