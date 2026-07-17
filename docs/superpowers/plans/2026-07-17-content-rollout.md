# Content Rollout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate coding levels and whole modules per parent account, reusing the shipped feature-flag system, so new content ships dark and releases gradually (deliver-but-hide).

**Architecture:** Content flags are ordinary registry keys. A `MODULE_FLAG`/`LEVEL_FLAG` map ties a module or `<module>:<level>` to an optional flag — no entry ⇒ always visible. The kid app filters the module list (Hub) and every level map's level list through `isModuleVisible`/`isLevelVisible`; progression consumes the filtered level list. Admin/API/store are unchanged (registry-driven).

**Tech Stack:** React 19 + TS (kid app), Next.js (web/admin — untouched here), node:test + tsx (`.test.ts` unit / `.test.tsx` DOM), Playwright (e2e), Prisma 7.

## Global Constraints

- Work in the worktree `/Users/valentine/dev/gabee/.worktrees/rollout` (branch `feat/content-rollout` off `origin/main`, which has the flag system). If `node_modules` is missing, run `pnpm install` first (git worktrees don't copy it).
- Content flags **ship dark**: `FLAG_FALLBACKS[key]=false`, `FLAG_DEFAULTS[key]=false`.
- **Unflagged content is always visible** — the filters must be the identity for any module/level with no map entry (no regression to live content).
- Only gate the **newest trailing** levels of a module (never a middle level behind which a visible level would strand).
- No admin/API/DB-schema changes — the flag system already covers them; `seed.ts` upserts a row per registry key (create-only).
- Sibling `.mts` imports use `.mjs`; kid tests are node:test+tsx.

## File Structure

- **Modify** `packages/types/src/flags.ts` — content flag(s) + `MODULE_FLAG`/`LEVEL_FLAG` + `moduleFlag`/`levelFlag`.
- **Modify** `packages/types/test/contracts.test.ts` — registry completeness + map lookups.
- **Modify** `apps/kid/src/lib/flags.ts` — `isModuleVisible(With)` / `isLevelVisible(With)` / `visibleLevels`.
- **Modify** `apps/kid/src/lib/flags.test.ts` — helper unit tests.
- **Modify** `apps/kid/src/screens/Hub.tsx` — filter module tiles.
- **Modify** the 8 level maps + `CarteRoad.tsx` — filter `configuredLevels` / road levels.
- **Modify** progression call sites — pass visibility-filtered levels.
- **Modify** the session orchestrator/router — hidden-target fallback.
- **Create** `apps/kid/src/screens/CodeWorldLevelMap.rollout.test.tsx` — DOM test.
- **Create** `e2e/tests/content-rollout.spec.ts` — e2e.

---

## Task 1: Registry — content flags + content→flag map

**Files:**
- Modify: `packages/types/src/flags.ts`
- Test: `packages/types/test/contracts.test.ts`

**Interfaces:**
- Produces: `MODULE_FLAG: Partial<Record<Module, FlagKey>>`, `LEVEL_FLAG: Record<string, FlagKey>`, `moduleFlag(m): FlagKey|undefined`, `levelFlag(m, level): FlagKey|undefined`. New registry key `code_l6`.

- [ ] **Step 1: Write the failing test** (append to `packages/types/test/contracts.test.ts`)

```ts
import { FLAG_KEYS, FLAG_FALLBACKS, FLAG_DEFAULTS, moduleFlag, levelFlag } from '../src/flags';

describe('content rollout flags', () => {
  it('registers code_l6 as a dark content flag', () => {
    assert.ok(FLAG_KEYS.includes('code_l6' as never));
    assert.equal(FLAG_FALLBACKS['code_l6' as never], false);
    assert.equal(FLAG_DEFAULTS['code_l6' as never], false);
  });
  it('levelFlag maps code:6 to code_l6 and returns undefined for unflagged units', () => {
    assert.equal(levelFlag('code', 6), 'code_l6');
    assert.equal(levelFlag('code', 3), undefined);
    assert.equal(levelFlag('numbers', 1), undefined);
  });
  it('moduleFlag returns undefined for unflagged modules', () => {
    assert.equal(moduleFlag('code'), undefined);
  });
});
```

(If `contracts.test.ts` lacks `describe`/`it`/`assert` imports, add `import { describe, it } from 'node:test'; import assert from 'node:assert/strict';`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/types test`
Expected: FAIL — `moduleFlag`/`levelFlag` not exported; `code_l6` unknown.

- [ ] **Step 3: Add the content flag + maps** (`packages/types/src/flags.ts`)

Add `'code_l6'` to `FLAG_KEYS`:

```ts
export const FLAG_KEYS = ['kid_voiceover', 'kid_ambient_music', 'kid_game_sounds', 'code_l6'] as const;
```

Add its dark entries to the three records:

```ts
// in FLAG_FALLBACKS:
code_l6: false, // content flag — ships dark
// in FLAG_DEFAULTS:
code_l6: false,
// in FLAG_DESCRIPTIONS:
code_l6: 'Coding level 6 (Debugging) — rollout gate. Dark until released per parent.',
```

Append the content→flag map + lookups at the end of the file:

```ts
import type { Module } from './enums';

/**
 * Content rollout maps. A module/level absent here has NO flag → always visible.
 * Gate only the newest trailing levels of a module.
 */
export const MODULE_FLAG: Partial<Record<Module, FlagKey>> = {
  // e.g. later: some new module → its module flag
};
export const LEVEL_FLAG: Record<string, FlagKey> = {
  'code:6': 'code_l6',
};
export function moduleFlag(m: Module): FlagKey | undefined { return MODULE_FLAG[m]; }
export function levelFlag(m: Module, level: number): FlagKey | undefined { return LEVEL_FLAG[`${m}:${level}`]; }
```

Export them from the package index if `packages/types/src/index.ts` re-exports named symbols (it re-exports `./flags` already — verify `moduleFlag`/`levelFlag`/`MODULE_FLAG`/`LEVEL_FLAG` are reachable; `export *` covers them).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @gabee/types test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/flags.ts packages/types/test/contracts.test.ts
git commit -m "feat(types): content rollout flags — code_l6 + MODULE_FLAG/LEVEL_FLAG maps"
```

---

## Task 2: Kid visibility helpers

**Files:**
- Modify: `apps/kid/src/lib/flags.ts`
- Test: `apps/kid/src/lib/flags.test.ts`

**Interfaces:**
- Consumes: `isFeatureEnabled`, `moduleFlag`, `levelFlag`.
- Produces: `isModuleVisibleWith`, `isLevelVisibleWith`, `isModuleVisible`, `isLevelVisible`, `visibleLevels(m, levels)`.

- [ ] **Step 1: Write the failing test** (append to `apps/kid/src/lib/flags.test.ts`)

```ts
import { isModuleVisibleWith, isLevelVisibleWith, visibleLevels } from './flags';

describe('content visibility', () => {
  const on = () => true;
  const off = () => false;
  it('unflagged module/level is always visible regardless of lookup', () => {
    assert.equal(isModuleVisibleWith('code', off), true);   // code has no module flag
    assert.equal(isLevelVisibleWith('code', 3, off), true); // L3 has no flag
    assert.equal(isLevelVisibleWith('numbers', 1, off), true);
  });
  it('flagged level follows the lookup', () => {
    assert.equal(isLevelVisibleWith('code', 6, off), false); // code_l6 off → hidden
    assert.equal(isLevelVisibleWith('code', 6, on), true);   // code_l6 on → visible
  });
  it('visibleLevels filters a level list by the lookup', () => {
    assert.deepEqual(visibleLevels('code', [1, 2, 6], off), [1, 2]);
    assert.deepEqual(visibleLevels('code', [1, 2, 6], on), [1, 2, 6]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/flags.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement** (append to `apps/kid/src/lib/flags.ts`)

```ts
import { moduleFlag, levelFlag, type Module } from '@gabee/types';

/** Pure, injectable gates (unit-testable without the store). */
export function isModuleVisibleWith(m: Module, lookup: (k: FlagKey) => boolean): boolean {
  const f = moduleFlag(m);
  return f === undefined || lookup(f);
}
export function isLevelVisibleWith(m: Module, level: number, lookup: (k: FlagKey) => boolean): boolean {
  const f = levelFlag(m, level);
  return f === undefined || lookup(f);
}
/** Production gates over the live flag store. */
export const isModuleVisible = (m: Module): boolean => isModuleVisibleWith(m, isFeatureEnabled);
export const isLevelVisible = (m: Module, level: number): boolean => isLevelVisibleWith(m, level, isFeatureEnabled);
/** Filter a derived level list to the visible ones (identity for unflagged modules). */
export const visibleLevels = (m: Module, levels: number[], lookup: (k: FlagKey) => boolean = isFeatureEnabled): number[] =>
  levels.filter((lvl) => isLevelVisibleWith(m, lvl, lookup));
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/lib/flags.ts apps/kid/src/lib/flags.test.ts
git commit -m "feat(kid): isModuleVisible / isLevelVisible / visibleLevels gates"
```

---

## Task 3: Hub — gate module tiles

**Files:**
- Modify: `apps/kid/src/screens/Hub.tsx`

**Interfaces:** Consumes `isModuleVisible`.

- [ ] **Step 1: Filter the module list**

In `Hub.tsx`, import the gate and filter `MODULES` before rendering. At the `{MODULES.map((m) => {` site ([Hub.tsx:78](../../../apps/kid/src/screens/Hub.tsx#L78)), change to iterate a filtered list:

```tsx
import { isModuleVisible } from '../lib/flags';
// …
{MODULES.filter((m) => isModuleVisible(m.id)).map((m) => {
```

`MODULE_FLAG` is empty in production, so this is the identity today — no visible change. Verify the Hub still renders all five modules.

- [ ] **Step 2: Typecheck + run existing Hub/kid tests**

```bash
pnpm --filter @gabee/kid typecheck
pnpm --filter @gabee/kid test
```
Expected: PASS (no behavior change with the empty module map).

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/screens/Hub.tsx
git commit -m "feat(kid): gate Hub module tiles through isModuleVisible"
```

---

## Task 4: Level maps + CarteRoad + progression — gate level lists

**Files (each has a `configuredLevels` memo — apply the identical filter):**
- `apps/kid/src/screens/CodeWorldLevelMap.tsx:56` (module `'code'`)
- `apps/kid/src/screens/NumbersLevelMap.tsx:93` (`'numbers'`)
- `apps/kid/src/screens/WordsPictureLevelMap.tsx:46`, `WordsFillLevelMap.tsx:46`, `WordsBuildLevelMap.tsx:53`, `WordsReadLevelMap.tsx:45` (`'words'`)
- `apps/kid/src/screens/KeyboardScrollingLevelMap.tsx:49`, `KeyboardStaticLevelMap.tsx:63` (`'keyboard'`)
- `apps/kid/src/screens/CarteRoad.tsx` `buildRoad` (`levels` at line 75)
- Test: `apps/kid/src/screens/CodeWorldLevelMap.rollout.test.tsx` (create)

**Interfaces:** Consumes `visibleLevels`.

- [ ] **Step 1: Write the failing DOM test** — `CodeWorldLevelMap.rollout.test.tsx`

Render `CodeWorldLevelMap` (world `maze`) with an injected code bundle that includes L1–L6 questions. Assert the L6 tile is absent while `code_l6` is off, and present when the store has `code_l6: true`. Model on an existing level-map/DOM test harness (`import '../test/setup-dom'`, patch `api.getBundle`, seed the store). Key assertions:

```tsx
// flag off (default): L6 tile not rendered
assert.equal(screen.queryByText(/Niveau 6|Level 6/).length ?? screen.queryAllByText(/6/).length >= 0, true);
// Prefer a data attribute: the tile uses labelFor(lvl); assert count of level tiles === 5 with flag off, 6 with flag on.
```

Use the tile count: with `code_l6` off, the map renders 5 tiles (L1–L5); set `useStore.setState({ featureFlags: { code_l6: true } })`, re-render, expect 6.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeWorldLevelMap.rollout.test.tsx`
Expected: FAIL — L6 shows even with the flag off (no filter yet).

- [ ] **Step 3: Apply the filter in every level map**

In each level map, wrap the `configuredLevels` result with `visibleLevels(<module>, …)`. Example for `CodeWorldLevelMap.tsx`:

```tsx
import { visibleLevels } from '../lib/flags';
// …
const configuredLevels = useMemo(
  () => visibleLevels('code', [...new Set(worldQs.map((q) => q.level))].sort((a, b) => a - b)),
  [worldQs],
);
```

Apply the identical change (correct module id) to `NumbersLevelMap` (`'numbers'`), `WordsPicture/Fill/Build/ReadLevelMap` (`'words'`), `KeyboardScrolling/StaticLevelMap` (`'keyboard'`). Because `visibleLevels` reads the live store, add the store's `featureFlags` to nothing extra — the memo re-derives on `worldQs`; a flag flip is picked up on the next render/navigation (acceptable per spec).

- [ ] **Step 4: Filter CarteRoad**

`buildRoad(questions, levelsProgress, subModeKey)` derives `levels` at [CarteRoad.tsx:75](../../../apps/kid/src/screens/CarteRoad.tsx#L75). Thread the module in and filter:

```tsx
// signature: add `module: Module`
const levels = visibleLevels(module, sortedUnique(pool.map((q) => q.level)));
```
Update `buildRoad`'s call site(s) to pass the module (grep `buildRoad(`), and import `visibleLevels` + `Module`.

- [ ] **Step 5: Guard progression call sites**

Grep `nextLessonFor(`, `pickNextLesson(`, `getProgressLevels(` usages. Wherever they receive `questions`/levels derived from a bundle, filter out hidden-level questions first so auto-advance never targets a hidden level:

```ts
const visibleQs = questions.filter((q) => isLevelVisible(q.module as Module, q.level));
```
(If a call site already scopes to one module, use that module id.) Keep `progression.ts`/`nextLesson.ts` themselves pure — filter only at the call sites.

- [ ] **Step 6: Run the DOM test + typecheck + regression**

```bash
pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeWorldLevelMap.rollout.test.tsx
pnpm --filter @gabee/kid typecheck
pnpm --filter @gabee/kid test
pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/*.test.tsx
```
Expected: rollout test PASS; all others PASS (empty maps for non-code + code L1–L5 unflagged ⇒ identity).

- [ ] **Step 7: Commit**

```bash
git add apps/kid/src/screens/*LevelMap.tsx apps/kid/src/screens/CarteRoad.tsx apps/kid/src/screens/CodeWorldLevelMap.rollout.test.tsx apps/kid/src/lib/nextLesson.ts
git commit -m "feat(kid): gate level lists (all maps + carte road + progression) through visibleLevels"
```

---

## Task 5: Session-entry guard

**Files:**
- Modify: the code session orchestrator / router entry (grep `CodeTurtleSession` usage and `router.ts`).

**Interfaces:** Consumes `isLevelVisible`.

- [ ] **Step 1: Guard a hidden target**

Where a session is entered for `(module, level)` (resume or deep-link), if `!isLevelVisible(module, level)` return to the hub / lesson map instead of starting. The `CodeTurtleSession` already returns a loader/unavailable when its pool is empty; add an explicit early guard at the routing layer so a flag that flips OFF mid-life doesn't drop a kid into a hidden level. Add a focused unit/DOM test if the router has a testable entry; otherwise assert via the session screen (empty visible pool → unavailable state).

- [ ] **Step 2: Typecheck + test + commit**

```bash
pnpm --filter @gabee/kid typecheck && pnpm --filter @gabee/kid test
git add -A && git commit -m "feat(kid): fall back to hub when entering a gated (hidden) level"
```

---

## Task 6: e2e — the code_l6 rollout gate

**Files:**
- Create: `e2e/tests/content-rollout.spec.ts`

- [ ] **Step 1: Write the spec**

Mirror `e2e/tests/kid-feature-flags.spec.ts` (DB-seed a flag override + relaunch). Steps: seed a `code` bundle that has an L6 question (or use the existing seed if it has L6; otherwise insert a fixture L6 question + publish); with `code_l6` override OFF for the fixture parent → the code world map shows no L6 tile; set the override ON in the DB, reload the page → the L6 tile appears. Reuse the feature-flag spec's DB helpers + seeded-auth.

- [ ] **Step 2: Run the e2e**

Run: `pnpm --filter @gabee/e2e test -- content-rollout` (match the repo's e2e invocation).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/content-rollout.spec.ts
git commit -m "test(e2e): code_l6 rollout gate (dark → per-parent enable)"
```

---

## Self-Review

**Spec coverage:**
- Registry content flags + `MODULE_FLAG`/`LEVEL_FLAG` + helpers → Task 1. ✅
- Kid `isModuleVisible`/`isLevelVisible`/`visibleLevels` → Task 2. ✅
- Hub module gate → Task 3. ✅
- Every level map + CarteRoad + progression → Task 4 (all 8 maps enumerated). ✅
- Session-entry guard → Task 5. ✅
- Admin: none (registry-driven) — no task, correct. ✅
- Tests: unit (types + kid), DOM (code L6), e2e → Tasks 1–2, 4, 6. ✅
- Ship-dark defaults (`false`/`false`), unflagged=visible → Task 1/Task 2 (identity). ✅

**Placeholder scan:** No TBD/TODO. Task 5's "grep the router/orchestrator" and Task 4 Step 5's "grep call sites" are concrete discovery instructions (the exact files vary; the filter to apply is fully specified).

**Type consistency:** `moduleFlag`/`levelFlag`/`MODULE_FLAG`/`LEVEL_FLAG` (Task 1) match `isModuleVisibleWith`/`isLevelVisibleWith`/`visibleLevels` (Task 2) and all consumers (Tasks 3–6). `FlagKey`/`Module` imported from `@gabee/types`.

**Risks:** (1) a missed level map would leak a gated level — Task 4 enumerates all eight + CarteRoad; the DOM/e2e cover code, and non-code maps are identity until a flag exists for them. (2) `visibleLevels` reads the store at render; a mid-session flip applies on next navigation (accepted, matches the flag system's no-real-time-push semantics).
