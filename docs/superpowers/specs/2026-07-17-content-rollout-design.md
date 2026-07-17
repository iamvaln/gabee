# Gabee — Content rollout (dynamic level/module gating) Design

**Date:** 2026-07-17
**Status:** design (awaiting review)
**Builds on:** the shipped admin feature-flag system (`feat/kid-feature-flags`, merged to `main` @ 13b2023 / PR #25) — registry + per-parent overrides + `/admin/flags` + offline-first kid store. See `docs/superpowers/specs/2026-07-16-kid-feature-flags-design.md`.
**Base branch:** `feat/content-rollout` off `origin/main`.

## Problem

New coding levels (L5+) and future modules should be releasable **without reaching every parent on merge** — ship dark, enable for select parents, then flip to general availability. The flag system already does exactly this for features (ambient music ships dark, admin releases per parent). It is not yet wired to gate **content units** (modules, levels).

## Goal

Let an admin gate a whole **module** or a specific **level** per parent account, reusing the existing flag system unchanged on the admin/server/store side. Gating is **deliver-but-hide**: the kid app hides gated units in the UI (consistent with how voiceover/music are gated); the bundle payload is untouched.

Non-goals (unchanged from the flag system's v1): percentage rollouts, per-child targeting, server-side bundle filtering, non-boolean flags, real-time push.

## Design

### 1. Registry — content flags + a content→flag map (`packages/types/src/flags.ts`)

Content flags are ordinary registry keys, declared in code like every other flag. Add, per rolled-out unit:
- a key to `FLAG_KEYS`,
- `FLAG_FALLBACKS[key] = false` and `FLAG_DEFAULTS[key] = false` (**ship dark**),
- a `FLAG_DESCRIPTIONS[key]`.

Naming convention: `module_<id>` for a module, `<module>_l<n>` for a level.

Add a typed mapping from content units to their **optional** flag:

```ts
import type { Module } from './enums';
/** A module/level with no entry here has NO flag → always visible. */
export const MODULE_FLAG: Partial<Record<Module, FlagKey>> = {
  // e.g. later: newmodule: 'module_newmodule',
};
export const LEVEL_FLAG: Record<string, FlagKey> = {
  // key is `${module}:${level}`, e.g. later: 'code:6': 'code_l6',
};
export function moduleFlag(m: Module): FlagKey | undefined { return MODULE_FLAG[m]; }
export function levelFlag(m: Module, level: number): FlagKey | undefined { return LEVEL_FLAG[`${m}:${level}`]; }
```

Stable/live content stays out of the maps → always visible (no regression on merge — the whole coding revamp in #26/#29 remains visible).

**Mechanism-only initial rollout** (per the decision): register **one example content flag `code_l6`** (a level that has no content yet, so gating it is invisible in production) to exercise the gate end-to-end and pre-wire the L6 rollout for Slice 4. No live content is gated.

### 2. Kid helpers (`apps/kid/src/lib/flags.ts`)

Two thin gates over the existing `isFeatureEnabled`, written as pure functions of an injectable flag lookup so they're unit-testable without touching the store:

```ts
import { moduleFlag, levelFlag, type FlagKey, type Module } from '@gabee/types';

export function isModuleVisibleWith(m: Module, lookup: (k: FlagKey) => boolean): boolean {
  const f = moduleFlag(m);
  return f === undefined || lookup(f);
}
export function isLevelVisibleWith(m: Module, level: number, lookup: (k: FlagKey) => boolean): boolean {
  const f = levelFlag(m, level);
  return f === undefined || lookup(f);
}
export const isModuleVisible = (m: Module) => isModuleVisibleWith(m, isFeatureEnabled);
export const isLevelVisible = (m: Module, level: number) => isLevelVisibleWith(m, level, isFeatureEnabled);
```

Offline-first is inherited: `isFeatureEnabled` returns the stored value or the code fallback (`false` for content flags → hidden until fetched-and-enabled).

### 3. Gating points (deliver-but-hide)

- **Hub** (`apps/kid/src/screens/Hub.tsx`): filter the rendered `MODULES` cards through `isModuleVisible(m.id)`.
- **Level maps** — every screen that derives the level list from the bundle filters it through `isLevelVisible(module, level)`. A shared helper keeps this DRY:
  - `apps/kid/src/screens/CodeWorldLevelMap.tsx` (code; level set derived at [CodeWorldLevelMap.tsx:53-57](../../../apps/kid/src/screens/CodeWorldLevelMap.tsx)),
  - the numbers / words / keyboard level maps (`NumbersLessonMap`, `WordsReadLevelMap`, `WordsBuildLevelMap`, `KeyboardStaticLevelMap`, and their lesson maps),
  - the overview `Carte.tsx` / `CarteRoad` road, which lists all levels.
- **Progression guard** (`apps/kid/src/lib/progression.ts`, `nextLesson.ts`): the "next level to unlock" and sequential-unlock logic must treat a hidden level as **absent** — completing the last visible level does not advance into a hidden one, and the road stops at the last visible level. Implemented by having the progression helpers receive the already-visibility-filtered level list (filter once at the call site, not deep in the lib), so the lib stays pure and its tests unchanged.
- **Session-entry guard** (`apps/kid/src/lib/router.ts` / the session screens): a resumed or deep-linked route into a now-hidden level/module falls back to the hub (a flag can flip off between sessions).

Modules/levels **not** in the flag maps are unaffected — the filters are the identity for them.

### 4. Admin — nothing new

Content flag keys appear automatically in `/admin/flags` (the page is registry-driven) with the global default toggle, editable description, and the per-parent overrides editor (searchable parent combobox). Rollout flow:
1. Ship the new content with its flag registered (`enabledDefault=false`, fallback `false`) — dark for everyone.
2. Add per-parent overrides = ON for early-access families.
3. When ready for GA, flip the flag's `enabledDefault` to ON (existing PATCH) — or leave it gated indefinitely.

The seed (`packages/db/prisma/seed.ts`) already upserts a `feature_flags` row per registry key (create-only), so new content flags get their dark defaults on the next seed with no extra code.

### 5. Rollout semantics

- Precedence (inherited): parent override > DB `enabledDefault` > code fallback.
- A never-fetched (freshly installed, offline) device applies the code fallback `false` → new content stays hidden until the device fetches flags online and the parent is enabled. This is the safe default for dark content.
- A flag flip is picked up at the next flag fetch (app launch / profile select); the UI re-evaluates on the next render. No reload needed.

## Files touched

- `packages/types/src/flags.ts` — content flags (example `code_l6`) + `MODULE_FLAG`/`LEVEL_FLAG` maps + `moduleFlag`/`levelFlag`/helpers.
- `packages/types/test/contracts.test.ts` — registry completeness for the new keys; map lookups.
- `apps/kid/src/lib/flags.ts` — `isModuleVisible(With)` / `isLevelVisible(With)`.
- `apps/kid/src/lib/flags.test.ts` — helper logic (unflagged→visible, flagged off→hidden, on→visible, offline fallback), module + level.
- `apps/kid/src/screens/Hub.tsx` — filter module cards.
- Level-map screens (code/numbers/words/keyboard) + `Carte.tsx`/`CarteRoad` — filter level lists via a shared `visibleLevels` helper.
- `apps/kid/src/lib/progression.ts` / `nextLesson.ts` call sites — pass visibility-filtered levels.
- `apps/kid/src/lib/router.ts` / session entry — fallback to hub for a hidden target.
- DB seed: no code change (registry-driven upsert covers new keys).

## Testing

- **Unit (types):** `FLAG_KEYS`/fallbacks/defaults/descriptions complete for new keys; `moduleFlag`/`levelFlag` lookups.
- **Unit (kid):** `isModuleVisibleWith`/`isLevelVisibleWith` — unflagged→true; flagged+lookup false→false; flagged+lookup true→true; offline fallback via `isFeatureEnabled` default.
- **DOM (kid):** with `code_l6` registered and an injected bundle containing an L6 question — the level map hides L6 when the flag is off and shows it when the store has it on; progression stops at the last visible level. (The **module** gate uses the identical helper shape; since all five modules are live there is no safe module to hide in production, so module gating is covered by the pure-helper unit tests plus asserting the `Hub` applies `isModuleVisible` — the production `MODULE_FLAG` map is empty, so the filter is the identity there.)
- **e2e (Playwright):** seed the `code_l6` override OFF for the fixture parent → L6 tile absent; flip ON in DB, relaunch → L6 tile present. Mirrors the ambient-music flag spec's DB-seed + relaunch instrumentation.

## Risks / open questions

1. **Many level-map screens** — each module has its own map; the shared `visibleLevels` helper must be applied in each. The plan enumerates every call site so none is missed (a missed map would show a gated level).
2. **Progression edge** — hiding a middle level (e.g. L4 gated, L5 visible) would strand L5 behind a hidden prerequisite. Convention: only gate the **newest trailing** levels of a module (L5, then L6…), never a middle one. Documented, not enforced in code for v1.
3. **`code_l6` example** — chosen because L6 has no content yet, so the example flag has zero production effect while fully exercising the path and pre-wiring Slice 4.
