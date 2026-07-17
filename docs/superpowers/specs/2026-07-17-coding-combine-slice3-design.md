# Coding module — Slice 3: combine (loop + if, top-level) — L5

**Date:** 2026-07-17
**Status:** design (approved in brainstorm; top-level combine, no nesting)
**Module:** `code` (maze + actions; draw L5 stays empty — deferred with draw conditions)
**Builds on:** Slice 1 (loop block + budget) and Slice 2 (if/else block + multi-board), both merged to main.

## Problem

L5 ("combine") currently has 100 single-board questions (maze 50, actions 50) whose reference answers nest a loop inside an if — but the editor builds neither nesting nor (until now) any construct, so L5 was flat-solvable and no different from sequencing. Slices 1–2 shipped the loop block, the if/else block, the block budget, and multi-board — **the editor already lets a child place a top-level loop AND a top-level if in one program.** So L5 needs no editor change; it needs content that genuinely *requires both*.

## Goal

L5 puzzles require **one program that uses a loop AND an if**, at the top level (no nesting), by combining both forcing mechanisms:
- **loop forced by budget** (Slice 1): a shared corridor whose flat form exceeds `config.maxBlocks`.
- **if forced by multi-board** (Slice 2): a fork where boards differ, so a branch-free program fails one.

The only program that fits the budget **and** solves all boards is `repeat P [→] · if wall_… { … } else { … }`.

## Design

**No editor / runtime / publish change.** At L5, `config.blocks = [arrows, repeat, if]`, `config.boards` present, `config.maxBlocks` set — the shipped editor renders both bank buttons, the budget, and the multi-board row; `publish.mts`'s `solvesAllBoards` already validates across boards and ignores `maxBlocks`.

**Generator `packages/db/prisma/author-combo.mts`** (sibling of `author-loops`/`author-conditions`) emits multi-board maze + actions L5 puzzles = a **loop-corridor + an if-fork**:
- maze: `[repeat P [M], if wall_M { detour } else { straight }]` over a shared corridor to a decision cell, then a Slice-2 common-goal fork (board A walls the straight → detour; board B walls the detour → straight).
- actions: `[pick, repeat P [M], if wall_M { deliverA } else { deliverB }, drop]` with a per-board target (Slice-2 actions design), carrying the item along a looped corridor.

Each puzzle self-verified by **three gates** (reuses the embedded solver + `isForcing` from author-conditions, plus a loop-forcing check):
1. reference solves **all boards**;
2. **if-forcing** — collapsing the if to then-only *and* else-only each fails a board;
3. **loop-forcing** — inlining the loop (replace `repeat P [body]` with P copies of the body) makes `blockCount` exceed `maxBlocks`.

`maxBlocks = blockCount(reference)`; corridor length `P ≥ 3` guarantees the loop compresses. Branches/bodies are primitives only (editor-constructible: top-level loop + top-level if, depth 1).

Replaces the existing single-board L5 (maze + actions). Pool floor 20 per `(world, L5)`.

## Files touched

- Create: `packages/db/prisma/author-combo.mts` (+ `.test.mts`).
- Modify: `packages/db/prisma/seed-data/code.json` (replace L5 maze/actions).
- DOM (optional): a kid test that builds loop+if to solve a 2-board budgeted L5 puzzle — reuses the Slice 1/2 harness.

## Deliverable

**Real seeded content**: after authoring, run `validate-seed` → `db:seed` → `publish.mts` and confirm all L5 combine puzzles are `confirmed` (0 held). The committed `code.json` carries the new L5 content.

## Testing

- Generator test: every generated puzzle solves all boards + if-forcing + loop-forcing + editor-constructible (depth ≤ 1) + ≥20 per world.
- `publish` confirms all (multi-board solver).
- Regression: single-board levels + Slice 1/2 DOM tests unaffected.
