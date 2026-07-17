# Coding module — Slice 2: conditions (`if`/`else`) via multi-board

**Date:** 2026-07-17
**Status:** design (awaiting review)
**Module:** `code` (worlds: maze, actions — draw deferred, needs a pen mechanic)
**Builds on:** Slice 1 (interactive loop block + nested program model). See `2026-07-16-coding-loops-slice1-design.md`.

## Problem

Slice 1 made loops a construct the child places, forced by a block budget. Conditions are next (L4), but they have a distinct problem: **in a single, fully-visible puzzle an `if wall` is never strictly required** — the child sees the walls and hardcodes a path. That's why the existing L4 "conditions" content feels no different: its reference answers use `if`, but the child solves flat. A budget won't fix this (a branch doesn't compress).

The engine already supports the runtime side: `runProgram` evaluates `{op:'if', cond:'wall_<dir>', then, else?}` by sensing whether the neighbouring cell is blocked ([turtle.ts:202-208](../../../apps/kid/src/lib/turtle.ts#L202)). The child editor excludes `if` (like it excluded `repeat` before Slice 1).

## Goal

Make conditions a construct the child places **and genuinely needs**, by requiring **one program to solve several boards that differ** — so a fixed path fails and `if wall → … else …` is the only way through. Applies to **maze** and **actions**.

### Roadmap position

| Level | Objective | Construct | Slice |
|-------|-----------|-----------|-------|
| L3 | Loops | `repeat` block + budget | 1 (done) |
| **L4** | **Conditions** | **`if`/`else` block + multi-board** | **2 (this spec)** |
| L5 | Combine | loop-in-branch / if-in-loop (nesting) | 3 |
| L6 | Debugging | `given_program` | 4 |
| L7 | Efficiency | star scoring | 5 |

## Scope of Slice 2

In scope:

1. **Content model**: additive `config.boards` — an array of board variants a single program must all solve.
2. **Runtime**: `runBoards` — run one program across all boards; success = all pass.
3. **Renderer**: side-by-side boards; Run animates each in turn, highlighting the active one.
4. **Editor**: an `if` block (tap active container) with a **condition selector** (sense wall in a direction) + **then** and **else** slots. Branches hold primitives only.
5. **Publish**: `publish.mts` solver runs all boards; confirms only if the reference solves every board.
6. **Content**: a conditions generator authoring self-verified, *forcing* multi-board maze + actions L4 puzzles, replacing the existing single-board L4 content.

Explicit non-goals (later slices):

- **Nesting** — no loop inside an `if` branch, no `if` inside a loop, no `if` inside `if` (Slice 3 "combine"). L4 palette is arrows + `if` only (no loop button).
- **draw conditions** — needs a pen up/down mechanic the engine lacks; its own future slice.
- **Debugging / efficiency** (Slices 4–5).
- Sensors other than `wall_<dir>` (the only condition the engine evaluates).

## Design

### 1. Content model — `config.boards` (additive, backward-compatible)

A conditions question carries board variants:

```json
"config": {
  "grid": { "w": 6, "h": 1 },
  "concept": "conditions",
  "blocks": ["up","down","left","right","if"],
  "boards": [
    { "start": [0,0], "goal": [3,0], "walls": [[1,0]] },
    { "start": [0,0], "goal": [3,0], "walls": [] }
  ]
}
```

- `boards[i]` holds the **per-board** geometry: maze → `start`/`goal`/`walls`; actions → `start`/`items`/`targets`/`walls`. `grid`/`blocks`/`concept` remain shared at the top level.
- **Backward compatibility:** when `boards` is absent, the puzzle is treated as a single board built from the top-level `start`/`goal`/… (exactly today's behaviour). All existing questions keep working unchanged.
- The child writes **one** program; success = it solves every board.

### 2. Runtime — `runBoards`

New in `apps/kid/src/lib/turtle.ts`:

```ts
export interface BoardsResult { perBoard: RunResult[]; success: boolean }
export function runBoards(base: Puzzle, program: Op[]): BoardsResult;
```

- Derives the board list from `base` (`config.boards` → one `Puzzle` per variant via `parsePuzzle`; or `[base]` when absent).
- Runs `runProgram(boardPuzzle, program)` for each; `success = perBoard.every(r => r.success)`.
- `parsePuzzle` gains a helper `boardsFor(world, config): Puzzle[]` so both the app and the renderer share one source of truth for the variant list.
- The `if` evaluator is unchanged — each board carries its own `walls`, so the same program branches per board automatically.

### 3. Renderer — side-by-side boards

In `CodeTurtleSession`:

- The stage renders one `CellGrid` per board (2, sometimes 3), in a horizontal flex row (desktop-first; wraps on narrow screens).
- Run animates the program on each board **sequentially**, highlighting the active board and its frame; a board that fails is marked. Win requires all boards to reach goal.
- The program strip + bank sit once below the row (one shared program).
- Single-board questions render exactly one grid (unchanged look).

### 4. Editor — the `if` block

- Bank gains an **`if` block** (⚡ / a fork glyph), shown when `config.blocks` includes `if`.
- Tap it → inserts an `if` container (active) with:
  - a **condition selector**: four small direction arrows to choose `wall_up|down|left|right` (default `wall_right`), shown as "si mur → / if wall →".
  - a **then** slot and an **else** slot. Tap a slot to make it the active fill target; placed arrows go into that slot. A "Done" affordance deactivates.
- Extends the Slice 1 nested-program model (`lib/program.ts`): the `Op` union already includes `if`; add `addIf`, `setCond`, and slot-aware `addPrim`/remove (target = `{loop:i}` or `{if:i, branch:'then'|'else'}`). `blockCount` counts the `if` container + both branch bodies.
- Branches hold primitives only (Slice 2). The active-target concept generalises Slice 1's `active: number | null` to `active: { index: number; slot: 'body' | 'then' | 'else' } | null`.

### 5. Publish / solver change

`publish.mts` `solves()` currently runs one board. Change:

- Add `boardsFor(config)` (mirroring the app helper) and run the reference `answer` against **every** board; confirm only if all pass.
- Keep single-board behaviour when `boards` absent.

### 6. Content — conditions generator + forcing check

New `packages/db/prisma/author-conditions.mts` (sibling of `author-loops.mts`):

- Emits multi-board maze + actions L4 puzzles: a base path with a **decision cell** where a wall is present on some boards and absent on others; the reference program uses `if wall_<dir> { detour } else { straight }`.
- **Self-verification (two gates):**
  1. the reference program solves **all** boards (embedded solver mirroring `publish.mts`);
  2. **forcing check** — collapsing the `if` to then-only *and* to else-only each fails at least one board (so the branch is genuinely required; a flat program cannot pass all boards).
- Assigns `status: "candidate"`; `publish` re-verifies. Drops the existing single-board L4 questions (never forcing) and installs the generated ones. Pool floor 20 per `(world, L4)`.

## Files touched

- `apps/kid/src/lib/turtle.ts` — `boardsFor`, `runBoards`, `BoardsResult`.
- `apps/kid/src/lib/turtle.test.ts` — `runBoards` + `boardsFor` coverage.
- `apps/kid/src/lib/program.ts` — `if` support: `addIf`, `setCond`, slot-aware add/remove, generalised `active`, `blockCount` with branches.
- `apps/kid/src/lib/program.test.ts` — if-op model coverage.
- `apps/kid/src/screens/CodeTurtleSession.tsx` — multi-board render row + sequential run; `if` bank button; condition selector; then/else slots.
- `apps/kid/src/screens/CodeTurtleSession.conditions.test.tsx` — DOM test: place if, pick condition, fill then/else, solve 2 boards.
- `apps/kid/src/i18n.ts` — `code.if`, `code.then`, `code.else`, `code.ifWall`, board labels.
- `packages/db/prisma/publish.mts` — multi-board `solves`.
- `packages/db/prisma/author-conditions.mts` (+ `.test.mts`) — generator + forcing check.
- `packages/db/prisma/seed-data/code.json` — replaced L4 maze/actions content.

## Testing

- **Unit**: `program.ts` if-model (add/fill then/else, blockCount, remove); `boardsFor`/`runBoards` (all-pass vs one-fail); generator (every puzzle solves all boards + forcing check holds).
- **Component**: `CodeTurtleSession` conditions — place an if, choose condition, fill then/else, run across 2 boards, win; a wrong branch fails one board.
- **Publish**: multi-board solver confirms authored conditions; a deliberately-broken board is held.
- Regression: Slice 1 loops DOM test + single-board L1–L3 still pass (no `boards` → single board).

## Risks / open questions

1. **Board animation pacing** — sequential run across 2–3 boards must stay short for young kids; tune the per-board interval and consider animating boards in parallel if sequential feels slow.
2. **`active` model change** — generalising Slice 1's `active: number | null` to a slot-aware object touches loop handling; keep Slice 1's loop tests green.
3. **Forcing-check completeness** — "then-only and else-only each fail a board" proves the branch matters for the reference shape; it doesn't prove *no* other flat program works. For the generated board shapes (single decision cell) that's sufficient, but note the limitation.
4. **publish.mts duplication** — `boardsFor` logic will exist in both the app and publish; keep them in sync (consider a shared note/comment).
