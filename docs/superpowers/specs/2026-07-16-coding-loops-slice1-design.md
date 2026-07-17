# Coding module — Slice 1: interactive loop block + retrofitted Loops level

**Date:** 2026-07-16
**Status:** design (awaiting review)
**Module:** `code` (kid app coding worlds — `maze` / `draw` / `actions`)

## Problem

The coding module is labelled "premiers pas en programmation" and its five levels are
tagged sequence → loops → conditions → combo. But the child-facing editor
([apps/kid/src/screens/CodeTurtleSession.tsx:43-67](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L43))
only lets the child place a **flat** list of primitives — four arrows plus pick/drop.
`if` and `repeat` are explicitly excluded from the palette (`if: null, repeat: null`).

The `repeat`/`if` ops in each question's reference `answer` exist solely so
[publish.mts](../../../packages/db/prisma/publish.mts) can verify the puzzle is solvable.
The child never sees or places a loop or a condition. Consequently **all five levels are
the same activity — laying a flat trail of arrows** — and only the puzzle geometry changes.
This is why levels feel "too simple," most visibly in `maze` and `draw` (which reduce to
"trace the path"). `optimal_blocks` is hardcoded to `1`
([CodeTurtleSession.tsx:311](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L311)), so
there is no efficiency pressure either.

## Goal

Make loops a construct the child actually **places and fills**, and make the Loops level
genuinely require one. This is the first vertical slice of a larger retrofit that gives the
whole module its point.

### The full ladder (roadmap — context only, not all in scope)

| Level | Objective | Construct the child places | Slice |
|-------|-----------|----------------------------|-------|
| L1–L2 | Sequencing mastery (easy → harder) | flat arrows (today) | done |
| **L3** | **Loops** — compress a repeated motif | **`repeat` block with a body** | **Slice 1 (this spec)** |
| L4 | Conditions — react to the world | `if` block (`wall_*` sensor) | Slice 2 |
| L5 | Combine — two-way / nested | `else` slot + nesting | Slice 3 |
| L6 | Debugging — read & fix broken code | `given_program` pre-loaded | Slice 4 |
| L7 | Efficiency — elegant, not just correct | block-budget star scoring | Slice 5 |

Through-line: **sequence → loop → condition → combine → debug → optimize** (standard
early-CS progression). Each slice = editor bit + content re-classification + authoring +
publish, fully working before the next.

## Scope of Slice 1

In scope:

1. **Editor**: a placeable, fillable `repeat` block (tap-based "active container"), with a
   count selector. Single level of nesting: the loop body holds only primitives.
2. **Program model**: editor state becomes a nested `Op[]` instead of a flat `Prim[]`.
3. **Block budget**: Loops-level puzzles carry `config.maxBlocks`; the child sees a budget
   and must fit it, so a flat brute-force is not viable and the loop is the sensible path.
4. **Content re-classification**: a script re-sorts all 750 existing questions to the level
   their reference concept truly belongs to, rewriting `code.json`.
5. **Loops-level authoring**: fill each `(sub_mode, loops)` pool to ≥20 with real
   repeated-motif puzzles carrying `maxBlocks`.
6. **Promotion**: unchanged — reseed → `publish` (solver re-verifies) → bundle version.

Explicit non-goals (later slices):

- The `if` / condition block, `else`, and nesting deeper than one level (Slices 2–3).
- Re-authoring the Conditions/Combo levels to *require* their constructs (Slices 2–3).
  Those levels stay flat-solvable in the interim — no worse than today.
- Debugging / `given_program` (Slice 4).
- Full efficiency star-scoring; `maxBlocks` here is a minimal pass/fail budget, not stars
  (Slice 5).
- Drag-and-drop editing. The editor stays tap-based.

## Design

### 1. Program model

`CodeTurtleSession` state changes from `useState<Prim[]>` to a nested program
`useState<Op[]>`, where `Op` is the existing type from
[apps/kid/src/lib/turtle.ts](../../../apps/kid/src/lib/turtle.ts):

```ts
type Op =
  | { op: 'move'; dir: MoveDir }
  | { op: 'pick' }
  | { op: 'drop' }
  | { op: 'repeat'; n: number; body: Op[] };   // if is deferred to Slice 2
```

Slice 1 restricts the body to primitives only (no `repeat`/`if` inside a `repeat`). The
interpreter (`runProgram`) already executes `repeat`, and `flattenProgram` already exists —
**no interpreter changes needed**. `blocks_used` telemetry counts placed blocks (a loop
counts as its container + its body blocks); `optimal_blocks` is populated from the puzzle's
`maxBlocks` rather than the hardcoded `1`.

### 2. Editor interaction — tap-based "active container"

The current editor appends a primitive on palette tap and removes on block tap. Slice 1 adds:

- The bank gains a **loop block** `🔁` (rendered wherever `config.blocks` contains `repeat`).
- Tapping `🔁` inserts an empty `repeat` container into the program and marks it **active**
  (highlighted). It shows `×n` with `+`/`−` (range **2–5**, default **2**).
- While a container is active, palette taps append into its `body` instead of the top level.
- A **Done** affordance (and tapping outside the container) deactivates it; subsequent taps
  return to the top level.
- Tapping any placed block removes it (removing a loop removes its body too).

Desktop-first layout (per project convention; mobile collapse follows):

```
PROGRAM                          Blocs 3/6
+-----------------------------------------+
| (>) x2  [ACTIVE]                         |
|    +---------------------------------+   |
|    |  ^-up   >-right                 |   |
|    |  [ tap arrows -> drop in here ] |   |
|    +---------------------------------+   |
|  [ Done ]                               |
+-----------------------------------------+
BANK:  ^  v  <  >   (>) loop
```

### 3. Block budget

Loops-level questions add one config field:

```json
"config": { ..., "maxBlocks": 6 }
```

- The editor shows `Blocs n/maxBlocks`. When the budget is reached, **the placing tap is
  refused** and a gentle nudge is surfaced (copy/animation confirmed during implementation).
- `maxBlocks` is set below the length of the flat solution but at/above the loop solution's
  block count, so the loop is required to fit.
- Only the Loops level uses `maxBlocks` in Slice 1. Sequence/conditions/combo omit it and
  behave as today.

### 4. Content re-classification

New one-shot script `packages/db/prisma/reclassify-code.mts`:

1. Read [code.json](../../../packages/db/prisma/seed-data/code.json).
2. Classify each question by the ops its reference `answer` truly needs
   (walking `body`/`then`/`else`):
   - only `move`/`pick`/`drop` → **sequence**
   - contains `repeat`, no `if` → **loops**
   - contains `if`, no `repeat` → **conditions**
   - contains both → **combo**
3. Target level ↔ concept mapping:
   - L1 = sequence (easy), L2 = sequence (harder), L3 = loops, L4 = conditions, L5 = combo.
4. Reassign `level` + `theme` **only when the true concept differs from the level's concept**
   (minimise churn):
   - A loops/conditions/combo question sitting at the wrong level moves to its concept level.
   - Sequence questions already at L1/L2 stay put; sequence questions found at L3+ (e.g. the
     50 currently mis-filed at L4) move to **L2**.
   - `sub_mode` and `id` are preserved.
5. Write `code.json` back (stable key order; ids unchanged so the seed diff is reviewable).
6. Print a re-classification report (counts moved per sub_mode/level).

Pool floor: after re-sort, any `(sub_mode, level)` below the 20-question minimum is flagged;
the gap is filled by authoring (below). The Loops level is the one we actively author for in
Slice 1.

### 5. Loops-level authoring

For each `(sub_mode ∈ {maze, draw, actions}, level = loops)` reach ≥20 (target ~50 to match
the existing pool density) questions that:

- Have a clearly **repeated motif** (e.g. `maze`: a corridor unit repeated; `draw`: a square
  = repeat 4× [forward, turn]; `actions`: pick/drop a row of items).
- Carry `maxBlocks` set so the loop is required.
- Reference `answer` uses a single `repeat` over primitives (no nesting, no `if`).
- Authored with `status: "candidate"`; `publish`'s solver confirms solvability.

### 6. Promotion / flow (unchanged)

`pnpm --filter @gabee/db db:seed` (full reset) → `pnpm --filter @gabee/db exec tsx
prisma/publish.mts` (solver confirms only solvable code questions, cuts a new
`ContentBundleVersion`). The solver already simulates `repeat`, so retrofitted loop puzzles
are verified end-to-end with no publish change.

## Files touched

- `apps/kid/src/screens/CodeTurtleSession.tsx` — nested program state, loop block in bank,
  active-container interaction, count selector, budget display/enforcement.
- `apps/kid/src/screens/CodeTurtleSession.tsx` palette map (`BLOCK_TO_PRIM` /
  `paletteFor`) — `repeat` maps to the loop block instead of `null`; `if` stays `null`.
- `apps/kid/src/lib/turtle.ts` — no logic change; confirm `Op`/`flattenProgram` exports
  used by the editor.
- `apps/kid/src/screens/CodeTurtleSession.guide.test.tsx` — extend guide/interaction tests.
- `packages/db/prisma/reclassify-code.mts` — new re-classification script.
- `packages/db/prisma/seed-data/code.json` — re-sorted levels + new loops-level questions.
- Possibly `packages/types` — if `maxBlocks` needs to pass `QuestionRecordSchema`/config
  validation (verify the config schema is permissive first).

## Testing

- **Unit**: `reclassify-code` classifier — table of reference programs → expected concept
  (including nested `repeat`/`if` walking and the both→combo case).
- **Component**: `CodeTurtleSession` — place a loop, set count, fill body, run to success;
  budget refuses a block past `maxBlocks`; removing a loop removes its body.
- **e2e** (kid): a Loops session solved *with* a loop, star awarded; verify a flat solution
  cannot fit the budget.
- **Publish**: existing solver confirms all authored loop candidates (unsolvable ones held).

## Risks / open questions

1. **Budget UX for young kids**: refusing a tap past budget must feel gentle, not punitive.
   Confirm the copy/animation during implementation.
2. **`maxBlocks` validation**: verify `config` is loose enough in `QuestionRecordSchema`
   (schema.prisma stores `config Json?`) so no migration is needed — expected, but check.
3. **Re-classification churn**: keep the `code.json` diff reviewable (stable ordering, ids
   unchanged) so the content move is auditable in one PR.
4. **Combo level in the interim**: after re-sort, combo (L5) puzzles whose reference uses a
   loop will now offer the loop block but still can't offer `if` until Slice 2 — they remain
   flat-solvable, acceptable for the interim.
