# Coding Conditions — Slice 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make conditions (`if`/`else`) a construct the child places and genuinely needs, by requiring one program to solve several boards that differ. maze + actions, L4.

**Architecture:** Additive `config.boards` (absent → single board, fully backward-compatible). A `runBoards` runner runs one program across all boards; a side-by-side renderer animates each in lockstep. The `if` block extends Slice 1's nested-program model with a condition selector + then/else slots. `publish.mts` verifies all boards. A conditions generator authors self-verified, *forcing* puzzles.

**Tech Stack:** React 19 + TS (kid app), node:test + tsx (`.test.ts` unit via `pnpm test`, `.test.tsx` DOM via `pnpm test:dom`), Prisma 7 + tsx (`packages/db`).

## Global Constraints

- Work in the isolated worktree `/Users/valentine/dev/gabee/.worktrees/slice2` (branch `feature/coding-conditions-slice2`). Shared main tree is contested by other sessions — do not use it.
- Kid app **desktop-first**; keep the mobile flex-wrap working.
- Editor stays **tap-based**.
- **No nesting** in Slice 2: `if` branches and loop bodies hold **primitives only** (no loop-in-branch, if-in-if, or if-in-loop). L4 palette = arrows + `if` (no loop button).
- `if` condition vocabulary is exactly `wall_up|down|left|right` (the only sensor the interpreter evaluates, [turtle.ts:202-208](../../../apps/kid/src/lib/turtle.ts#L202)).
- `config` is validated by `z.unknown().optional()` — `boards` needs **no schema change**.
- Content flow unchanged: edit `code.json` → `db:seed` → `publish.mts` (solver gate).
- Pool floor 20 per `(world, L4)`.
- Sibling `.mts` imports use the `.mjs` extension (Bundler resolution rejects `.mts`; extensionless fails too).
- No new deps.

---

## File Structure

- **Modify** `apps/kid/src/lib/program.ts` — `if` support: `slot` on `ProgramState`, `addIf`, `setCond`, `setSlot`, slot-routed `addPrim`/remove, `blockCount` with branches. Backward-compatible with Slice 1 loops.
- **Modify** `apps/kid/src/lib/program.test.ts` — if-model coverage.
- **Modify** `apps/kid/src/lib/turtle.ts` — `boardsFor`, `runBoards`, `BoardsResult`.
- **Modify** `apps/kid/src/lib/turtle.test.ts` — `boardsFor` + `runBoards` coverage.
- **Modify** `apps/kid/src/screens/CodeTurtleSession.tsx` — if-block editor (Task 3) + multi-board render/run (Task 4).
- **Create** `apps/kid/src/screens/CodeTurtleSession.conditions.test.tsx` — DOM tests.
- **Modify** `apps/kid/src/i18n.ts` — condition strings.
- **Modify** `packages/db/prisma/publish.mts` — multi-board solver; export `solvesAllBoards` for testing.
- **Create** `packages/db/prisma/publish-boards.test.mts` — multi-board solver test.
- **Create** `packages/db/prisma/author-conditions.mts` (+ `.test.mts`) — generator + forcing check.
- **Modify** `packages/db/prisma/seed-data/code.json` — replaced maze/actions L4 content.

---

## Task 1: `if` support in the program model

**Files:**
- Modify: `apps/kid/src/lib/program.ts`
- Test: `apps/kid/src/lib/program.test.ts`

**Interfaces:**
- Consumes: `Op`, `Prim` from `turtle.ts` (the `Op` union already includes `{op:'if',cond,then,else?}`).
- Produces:
  - `type Slot = 'body' | 'then' | 'else'`
  - `type Cond = 'wall_up'|'wall_down'|'wall_left'|'wall_right'`
  - `ProgramState = { program: Op[]; active: number | null; slot: Slot }`
  - `addIf(s): ProgramState`, `setCond(s, index, cond): ProgramState`, `setSlot(s, slot): ProgramState`
  - updated `setActive(s, index, slot?)`, slot-routed `addPrim`, `removeInside(s, index, slot, bodyIndex)`, `blockCount` counting `if` + both branches.

- [ ] **Step 1: Write the failing tests** (append to `program.test.ts`)

```ts
import { addIf, setCond, setSlot, removeInside, type Slot } from './program';

describe('program model — if', () => {
  it('addIf appends if{cond:wall_right,then:[],else:[]} active on then', () => {
    const s = addIf(empty());
    assert.deepEqual(s.program, [{ op: 'if', cond: 'wall_right', then: [], else: [] }]);
    assert.equal(s.active, 0);
    assert.equal(s.slot, 'then');
  });
  it('adds primitives into the active then/else slot', () => {
    let s = addIf(empty());
    s = addPrim(s, 'down');            // into then
    s = setSlot(s, 'else');
    s = addPrim(s, 'right');           // into else
    assert.deepEqual(s.program[0], { op: 'if', cond: 'wall_right', then: [{ op: 'move', dir: 'down' }], else: [{ op: 'move', dir: 'right' }] });
  });
  it('setCond changes the sensed direction', () => {
    let s = addIf(empty());
    s = setCond(s, 0, 'wall_up');
    assert.equal((s.program[0] as { cond: string }).cond, 'wall_up');
  });
  it('removeInside drops one branch primitive', () => {
    let s = addPrim(setSlot(addPrim(addIf(empty()), 'down'), 'then'), 'left'); // then: [down,left]
    s = removeInside(s, 0, 'then', 0);
    assert.deepEqual((s.program[0] as { then: unknown[] }).then, [{ op: 'move', dir: 'left' }]);
  });
  it('blockCount counts the if container + both branches', () => {
    let s = addIf(empty());
    s = addPrim(s, 'down');                    // then: 1
    s = addPrim(setSlot(s, 'else'), 'right');  // else: 1
    assert.equal(blockCount(s.program), 3);    // if + then(1) + else(1)
  });
  it('loops still work (slot defaults to body)', () => {
    let s = addPrim(addLoop(empty()), 'right');
    assert.deepEqual(s.program[0], { op: 'repeat', n: 2, body: [{ op: 'move', dir: 'right' }] });
    assert.equal(s.slot, 'body');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/program.test.ts`
Expected: FAIL — `addIf`/`setCond`/`setSlot`/`removeInside` not exported.

- [ ] **Step 3: Rewrite `program.ts` with slot-based routing**

Replace the whole file body (keeping `makePrim`, `addLoop`, `setCount`, `removeTop` semantics) with:

```ts
import type { Op, Prim, MoveDir } from './turtle';

export type PrimKey = 'up' | 'down' | 'left' | 'right' | 'pick' | 'drop';
export type Slot = 'body' | 'then' | 'else';
export type Cond = 'wall_up' | 'wall_down' | 'wall_left' | 'wall_right';

/**
 * Nested-program editor state. `active` is the top-level container index being
 * filled (or null for top level); `slot` selects which opening of that container
 * receives placed blocks — loop 'body', or an if's 'then'/'else'. One level of
 * nesting only (branches/bodies hold primitives).
 */
export type ProgramState = { program: Op[]; active: number | null; slot: Slot };

export function makePrim(k: PrimKey): Prim {
  if (k === 'pick' || k === 'drop') return { op: k };
  return { op: 'move', dir: k as MoveDir };
}

export function empty(): ProgramState {
  return { program: [], active: null, slot: 'body' };
}

export function addPrim(s: ProgramState, k: PrimKey): ProgramState {
  const prim = makePrim(k);
  if (s.active === null) return { ...s, program: [...s.program, prim] };
  const program = s.program.map((op, i) => {
    if (i !== s.active) return op;
    if (op.op === 'repeat') return { ...op, body: [...op.body, prim] };
    if (op.op === 'if') return s.slot === 'else'
      ? { ...op, else: [...(op.else ?? []), prim] }
      : { ...op, then: [...op.then, prim] };
    return op;
  });
  return { ...s, program };
}

export function addLoop(s: ProgramState): ProgramState {
  const program = [...s.program, { op: 'repeat', n: 2, body: [] } as Op];
  return { program, active: program.length - 1, slot: 'body' };
}

export function addIf(s: ProgramState): ProgramState {
  const program = [...s.program, { op: 'if', cond: 'wall_right', then: [], else: [] } as Op];
  return { program, active: program.length - 1, slot: 'then' };
}

export function setActive(s: ProgramState, index: number | null, slot: Slot = 'body'): ProgramState {
  return { ...s, active: index, slot };
}

export function setSlot(s: ProgramState, slot: Slot): ProgramState {
  return { ...s, slot };
}

export function setCount(s: ProgramState, index: number, n: number): ProgramState {
  const clamped = Math.max(2, Math.min(5, n));
  return { ...s, program: s.program.map((op, i) => (i === index && op.op === 'repeat' ? { ...op, n: clamped } : op)) };
}

export function setCond(s: ProgramState, index: number, cond: Cond): ProgramState {
  return { ...s, program: s.program.map((op, i) => (i === index && op.op === 'if' ? { ...op, cond } : op)) };
}

export function removeTop(s: ProgramState, index: number): ProgramState {
  const program = s.program.filter((_, i) => i !== index);
  let active = s.active;
  if (active === index) active = null;
  else if (active !== null && active > index) active -= 1;
  return { program, active, slot: active === null ? 'body' : s.slot };
}

export function removeInside(s: ProgramState, index: number, slot: Slot, bodyIndex: number): ProgramState {
  const program = s.program.map((op, i) => {
    if (i !== index) return op;
    if (op.op === 'repeat' && slot === 'body') return { ...op, body: op.body.filter((_, j) => j !== bodyIndex) };
    if (op.op === 'if' && slot === 'then') return { ...op, then: op.then.filter((_, j) => j !== bodyIndex) };
    if (op.op === 'if' && slot === 'else') return { ...op, else: (op.else ?? []).filter((_, j) => j !== bodyIndex) };
    return op;
  });
  return { ...s, program };
}

export function blockCount(program: Op[]): number {
  let n = 0;
  for (const op of program) {
    n += 1;
    if (op.op === 'repeat') n += blockCount(op.body);
    else if (op.op === 'if') n += blockCount(op.then) + blockCount(op.else ?? []);
  }
  return n;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/program.test.ts`
Expected: PASS (all Slice 1 loop tests + new if tests).

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/lib/program.ts apps/kid/src/lib/program.test.ts
git commit -m "feat(kid/code): if/else support in the nested-program model (slot-based)"
```

---

## Task 2: `boardsFor` + `runBoards`

**Files:**
- Modify: `apps/kid/src/lib/turtle.ts`
- Test: `apps/kid/src/lib/turtle.test.ts`

**Interfaces:**
- Produces:
  - `boardsFor(world: CodeWorld, config: unknown): Puzzle[]` — one puzzle when `config.boards` absent, else one per variant (each merged over the shared config).
  - `interface BoardsResult { perBoard: RunResult[]; success: boolean }`
  - `runBoards(puzzles: Puzzle[], program: Op[]): BoardsResult`

- [ ] **Step 1: Write the failing tests** (append to `turtle.test.ts`)

```ts
import { boardsFor, runBoards } from './turtle';

describe('boardsFor', () => {
  it('returns a single board when config.boards is absent', () => {
    const bs = boardsFor('maze', { grid: { w: 3, h: 1 }, start: [0, 0], goal: [2, 0], walls: [] });
    assert.equal(bs.length, 1);
    assert.deepEqual(bs[0]!.goal, { x: 2, y: 0 });
  });
  it('returns one puzzle per board, each merged over shared config', () => {
    const bs = boardsFor('maze', {
      grid: { w: 3, h: 1 }, blocks: ['right', 'if'],
      boards: [{ start: [0, 0], goal: [2, 0], walls: [[1, 0]] }, { start: [0, 0], goal: [2, 0], walls: [] }],
    });
    assert.equal(bs.length, 2);
    assert.equal(bs[0]!.walls!.length, 1);
    assert.equal(bs[1]!.walls!.length, 0);
    assert.equal(bs[0]!.w, 3); // grid inherited
  });
});

describe('runBoards', () => {
  it('succeeds only when the program solves every board', () => {
    const bs = boardsFor('maze', {
      grid: { w: 3, h: 2 }, boards: [
        { start: [0, 0], goal: [2, 0], walls: [[1, 0]] }, // must detour down
        { start: [0, 0], goal: [2, 0], walls: [] },        // straight
      ],
    });
    const prog: Op[] = [{ op: 'if', cond: 'wall_right',
      then: [{ op: 'move', dir: 'down' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'up' }],
      else: [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }] }];
    assert.equal(runBoards(bs, prog).success, true);
    // else-only fails board A (wall blocks the first right)
    const elseOnly: Op[] = [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }];
    assert.equal(runBoards(bs, elseOnly).success, false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/turtle.test.ts`
Expected: FAIL — `boardsFor`/`runBoards` not exported.

- [ ] **Step 3: Implement in `turtle.ts`** (after `runProgram`)

```ts
/** Board variants a single program must all solve. Absent → one board from the base config. */
export function boardsFor(world: CodeWorld, config: unknown): Puzzle[] {
  const c = (config ?? {}) as Record<string, unknown>;
  const boards = c.boards as Record<string, unknown>[] | undefined;
  if (!Array.isArray(boards) || boards.length === 0) return [parsePuzzle(world, config)];
  return boards.map((b) => parsePuzzle(world, { ...c, ...b, boards: undefined }));
}

export interface BoardsResult { perBoard: RunResult[]; success: boolean }

export function runBoards(puzzles: Puzzle[], program: Op[]): BoardsResult {
  const perBoard = puzzles.map((p) => runProgram(p, program));
  return { perBoard, success: perBoard.length > 0 && perBoard.every((r) => r.success) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/turtle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/lib/turtle.ts apps/kid/src/lib/turtle.test.ts
git commit -m "feat(kid/code): boardsFor + runBoards multi-board runtime"
```

---

## Task 3: Editor — the `if` block (single board)

**Files:**
- Modify: `apps/kid/src/screens/CodeTurtleSession.tsx`
- Modify: `apps/kid/src/i18n.ts`
- Test: `apps/kid/src/screens/CodeTurtleSession.conditions.test.tsx` (create)

**Interfaces:**
- Consumes: `addIf`, `setCond`, `setSlot`, `setActive`, `removeInside`, `blockCount` from `program.ts`; `Cond`.
- Produces: an editor that renders an `if` bank button (when `config.blocks` includes `if`), an `if` container with a condition selector + then/else slots, producing a nested `Op[]` with an `if`.

- [ ] **Step 1: Write the failing DOM test** — `CodeTurtleSession.conditions.test.tsx`

Model on `CodeTurtleSession.loops.test.tsx` harness (same imports, `seedStore`, `api.getBundle`). Single-board maze where an if solves it:

```tsx
import '../test/setup-dom';
import { createElement, type ReactNode } from 'react';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { QuestionBundleResponse } from '@gabee/types';
import { api } from '../lib/api';
import { useStore } from '../store';
import { CodeTurtleSession } from './CodeTurtleSession';

const PROFILE_ID = 'kid-1';

// Single board: from [0,0], wall_right at [1,0] -> go down to goal [0,1].
function ifBundle(): QuestionBundleResponse {
  return {
    module: 'code', version: 1, published_at: '2026-07-10T00:00:00.000Z',
    questions: [{
      id: 'code-maze-cond-001', sub_mode: 'maze', level: 4, lesson: 1, theme: 'conditions',
      type: 'code-grid', prompt: { fr: 'x', en: 'x' },
      answer: [{ op: 'if', cond: 'wall_right', then: [{ op: 'move', dir: 'down' }], else: [{ op: 'move', dir: 'right' }] }],
      distractors: [], hint: { fr: '', en: '' }, difficulty: 2, concept_tags: [], lang: 'both',
      config: { grid: { w: 2, h: 2 }, start: [0, 0], goal: [0, 1], walls: [[1, 0]], concept: 'conditions', blocks: ['up', 'down', 'left', 'right', 'if'] },
    }] as unknown as QuestionBundleResponse['questions'],
  };
}

function seedStore() {
  useStore.setState({ lang: 'fr', profile: { id: PROFILE_ID, name: 'T', birth_date: null } as never, play: { id: 'p1' } as never });
}
function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactNode = createElement(QueryClientProvider, { client },
    createElement(CodeTurtleSession, { world: 'maze', level: 4, lesson: 1, isRevision: false, trigger: 'new', onDone: () => {}, onHome: () => {}, onBack: () => {} }));
  return render(tree);
}
const coach = () => document.querySelector('.bee-coach-text')?.textContent ?? '';

beforeEach(() => { localStorage.clear(); api.getBundle = async () => ifBundle(); seedStore(); });
afterEach(() => cleanup());

describe('CodeTurtleSession conditions — if block', () => {
  it('places an if, fills then/else, solves', async () => {
    renderSession();
    await screen.findByLabelText('if');
    fireEvent.click(screen.getByLabelText('if'));        // add if (then active, cond wall_right default)
    fireEvent.click(screen.getByLabelText('down'));      // into then
    fireEvent.click(screen.getByLabelText('slot-else')); // switch to else
    fireEvent.click(screen.getByLabelText('right'));     // into else
    fireEvent.click(screen.getByRole('button', { name: /Lancer|Run/ }));
    await waitFor(() => assert.match(coach(), /Bravo|Nice/), { timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeTurtleSession.conditions.test.tsx`
Expected: FAIL — no `if` bank button.

- [ ] **Step 3: Add i18n keys** (`i18n.ts`, both `code` blocks — fr then en)

```
// fr code:
ifWall: 'Si mur', then: 'Alors', else: 'Sinon', condition: 'if',
// en code:
ifWall: 'If wall', then: 'Then', else: 'Else', condition: 'if',
```

- [ ] **Step 4: Wire the imports + glyph** (`CodeTurtleSession.tsx`)

Add to the `../lib/program` import: `addIf as progAddIf, setCond as progSetCond, setSlot as progSetSlot, type Cond`. Add near `LOOP_GLYPH`:

```ts
const IF_GLYPH = '❓';
const COND_ARROW: Record<Cond, string> = { wall_up: '⬆️', wall_down: '⬇️', wall_left: '⬅️', wall_right: '➡️' };
```

- [ ] **Step 5: Add handlers** (next to `addLoop`/`setLoopCount`)

```ts
function addIf() {
  if (editLocked || atBudget) return;
  if (result === 'fail') setResult(null);
  setProg((s) => progAddIf(s));
  setFrame(0);
}
function chooseSlot(index: number, slot: 'then' | 'else') { if (!editLocked) setProg((s) => progSetActive(s, index, slot)); }
function chooseCond(index: number, cond: Cond) { if (!editLocked) setProg((s) => progSetCond(s, index, cond)); }
```

- [ ] **Step 6: Render the `if` container in the program strip**

In the `program.map(...)` (added in Slice 1), add an `op.op === 'if'` branch before the primitive branch. It renders: the condition selector (4 arrows calling `chooseCond`), a **then** slot and an **else** slot (each a tappable region with `aria-label="slot-then"`/`"slot-else"` calling `chooseSlot`, highlighted when `prog.active === i && prog.slot === '<slot>'`), and the branch chips (each removable via `removeInside(i, slot, j)`):

```tsx
op.op === 'if' ? (
  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 10,
    border: prog.active === i ? '3px solid #F5A623' : '2px solid #94a3b8', background: '#fff' }}>
    <span style={{ fontSize: 18 }}>{IF_GLYPH}</span>
    <span style={{ fontSize: 12, fontWeight: 700 }}>{t('code.ifWall')}</span>
    {(['wall_up','wall_down','wall_left','wall_right'] as Cond[]).map((cnd) => (
      <button key={cnd} aria-label={cnd} onClick={() => chooseCond(i, cnd)} disabled={editLocked}
        style={{ width: 26, height: 26, padding: 0, borderRadius: 6, border: op.cond === cnd ? '2px solid #0f172a' : '1px solid #cbd5e1', background: op.cond === cnd ? '#FDE9C8' : '#fff' }}>
        {COND_ARROW[cnd]}
      </button>
    ))}
    {(['then','else'] as const).map((slot) => (
      <button key={slot} aria-label={`slot-${slot}`} onClick={() => chooseSlot(i, slot)} disabled={editLocked}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 8,
          border: prog.active === i && prog.slot === slot ? '2px solid #F5A623' : '1px dashed #cbd5e1', background: '#F8FAFC' }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{t(slot === 'then' ? 'code.then' : 'code.else')}</span>
        {(op[slot] ?? []).map((b, j) => {
          const bp = b as Prim; const bk = bp.op === 'move' ? bp.dir : bp.op;
          return <span key={j} onClick={(e) => { e.stopPropagation(); removeInside2(i, slot, j); }} style={{ fontSize: 15 }} aria-label={`remove ${slot} ${bk}`}>{GLYPH[bk as PrimKey]}</span>;
        })}
      </button>
    ))}
  </div>
) : op.op === 'repeat' ? ( /* …existing loop render… */ ) : ( /* …existing primitive render… */ )
```

Add the helper `function removeInside2(i:number, slot:'then'|'else', j:number){ if(!editLocked) setProg((s)=>progRemoveInside(s,i,slot,j)); }` and import `removeInside as progRemoveInside`.

- [ ] **Step 7: Add the `if` bank button** (after the loop bank button)

```tsx
{puzzle.blocks.includes('if') && (
  <button aria-label="if" onClick={addIf} disabled={editLocked || atBudget}
    style={{ minWidth: 56, height: 60, padding: '0 10px', borderRadius: 12, background: '#E9D5FF', color: '#0f172a', border: '2px solid #0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, fontWeight: 700 }}>
    <span style={{ fontSize: 24, lineHeight: 1 }}>{IF_GLYPH}</span>
    <span style={{ fontSize: 11 }}>{t('code.condition')}</span>
  </button>
)}
```

- [ ] **Step 8: Run the DOM test + typecheck + regression**

```bash
pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeTurtleSession.conditions.test.tsx
pnpm --filter @gabee/kid typecheck
pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeTurtleSession.loops.test.tsx
```
Expected: conditions test PASS; typecheck clean; loops test still PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/kid/src/screens/CodeTurtleSession.tsx apps/kid/src/screens/CodeTurtleSession.conditions.test.tsx apps/kid/src/i18n.ts
git commit -m "feat(kid/code): if/else block editor (condition selector + then/else slots)"
```

---

## Task 4: Multi-board render + `runBoards` wiring

**Files:**
- Modify: `apps/kid/src/screens/CodeTurtleSession.tsx`
- Test: `apps/kid/src/screens/CodeTurtleSession.conditions.test.tsx` (extend)

**Interfaces:**
- Consumes: `boardsFor`, `runBoards` (Task 2).

- [ ] **Step 1: Write the failing test** (add an `it` to the conditions test)

Two-board maze that forces the branch (else-only and then-only each fail one board):

```tsx
function forcingBundle(): QuestionBundleResponse {
  return {
    module: 'code', version: 1, published_at: '2026-07-10T00:00:00.000Z',
    questions: [{
      id: 'code-maze-cond-forcing', sub_mode: 'maze', level: 4, lesson: 1, theme: 'conditions',
      type: 'code-grid', prompt: { fr: 'x', en: 'x' },
      answer: [{ op: 'if', cond: 'wall_right',
        then: [{ op: 'move', dir: 'down' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'up' }],
        else: [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }] }],
      distractors: [], hint: { fr: '', en: '' }, difficulty: 2, concept_tags: [], lang: 'both',
      config: { grid: { w: 3, h: 2 }, concept: 'conditions', blocks: ['up','down','left','right','if'],
        boards: [
          { start: [0,0], goal: [2,0], walls: [[1,0],[0,1]] }, // wall_right -> must NOT go down there? see note
          { start: [0,0], goal: [2,0], walls: [] },
        ] },
    }] as unknown as QuestionBundleResponse['questions'],
  };
}
// NOTE: the board walls come from the generator (Task 6); this fixture mirrors one generated case.

it('renders 2 boards and wins only when the if solves both', async () => {
  api.getBundle = async () => forcingBundle();
  renderSession();
  await screen.findByLabelText('if');
  fireEvent.click(screen.getByLabelText('if'));
  // then: down,right,right,up
  ['down','right','right','up'].forEach((k) => fireEvent.click(screen.getByLabelText(k)));
  fireEvent.click(screen.getByLabelText('slot-else'));
  ['right','right'].forEach((k) => fireEvent.click(screen.getByLabelText(k)));
  fireEvent.click(screen.getByRole('button', { name: /Lancer|Run/ }));
  await waitFor(() => assert.match(coach(), /Bravo|Nice/), { timeout: 6000 });
  // two grids rendered
  assert.equal(document.querySelectorAll('[data-board-grid]').length, 2);
});
```

(Use the exact board walls the generator emits — regenerate this fixture from Task 6 output so the reference truly solves both boards.)

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — only one grid renders / `runBoards` not wired.

- [ ] **Step 3: Replace single-puzzle state with boards**

In `CodeTurtleSession.tsx`, replace the `puzzle`/`run` memos:

```ts
const puzzles = useMemo(() => (q ? boardsFor(world, q.config) : null), [q, world]);
const puzzle = puzzles ? puzzles[0]! : null; // representative (palette/blocks/budget/guide)
const boardsRun = useMemo(() => (puzzles ? runBoards(puzzles, program) : null), [puzzles, program]);
```

Import `boardsFor`, `runBoards`. Keep `puzzle` for palette/guide/budget (all boards share `blocks`).

- [ ] **Step 4: Lockstep animation over boards**

The frame counter is shared; each board renders its own frame. Replace `run` usages: max frame length = `Math.max(...boardsRun.perBoard.map(r => r.frames.length))`. In `startRun`, iterate to that max; on completion `ok = boardsRun.success`. Per board `bi`, current frame = `perBoard[bi].frames[Math.min(frame, perBoard[bi].frames.length - 1)]`.

- [ ] **Step 5: Render a row of boards**

Replace the single `CellGrid`/`DrawGrid` at [session-stage:403-405](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L403):

```tsx
<div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
  {puzzles!.map((pz, bi) => {
    const r = boardsRun!.perBoard[bi]!;
    const bcur = r.frames[Math.min(frame, r.frames.length - 1)]!;
    const won = result === 'ok' || (!running && r.success && frame > 0);
    return (
      <div key={bi} data-board-grid style={{ outline: puzzles!.length > 1 && running ? '3px solid #F5A623' : 'none', borderRadius: 12, padding: 2 }}>
        {world === 'draw'
          ? <DrawGrid puzzle={pz} cur={bcur} cell={CELL} running={running} expr={beeExpr} />
          : <CellGrid puzzle={pz} cur={bcur} cell={CELL} running={running} expr={beeExpr} result={won ? 'ok' : result} />}
      </div>
    );
  })}
</div>
```

(For 2–3 boards the CELL size is computed from a single board's dims; keep as-is — boards share `grid`.)

- [ ] **Step 6: Point telemetry/guide at the representative board**

`code_run` and `guideScript` already use `puzzle` (= `puzzles[0]`) and `program`; `flattenProgram(puzzle, program)` stays. `startRun` success uses `boardsRun.success`. Update the `startRun` guard `!run` → `!boardsRun`, and `run.frames` → the max-length logic above.

- [ ] **Step 7: Run the tests + typecheck + full regression**

```bash
pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeTurtleSession.conditions.test.tsx
pnpm --filter @gabee/kid typecheck
pnpm --filter @gabee/kid test
pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeTurtleSession.loops.test.tsx src/screens/CodeTurtleSession.guide.test.tsx
```
Expected: all PASS (single-board loops/guide unchanged — `boardsFor` returns one board).

- [ ] **Step 8: Commit**

```bash
git add apps/kid/src/screens/CodeTurtleSession.tsx apps/kid/src/screens/CodeTurtleSession.conditions.test.tsx
git commit -m "feat(kid/code): side-by-side multi-board render + runBoards (lockstep)"
```

---

## Task 5: `publish.mts` multi-board solver

**Files:**
- Modify: `packages/db/prisma/publish.mts`
- Test: `packages/db/prisma/publish-boards.test.mts` (create)

**Interfaces:**
- Produces: `export function solvesAllBoards(world, config, program): boolean` — true only if the reference solves every board (single board when `boards` absent).

- [ ] **Step 1: Write the failing test** — `publish-boards.test.mts`

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { solvesAllBoards } from './publish.mjs';

const prog = [{ op: 'if', cond: 'wall_right',
  then: [{ op: 'move', dir: 'down' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'up' }],
  else: [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }] }];

describe('solvesAllBoards', () => {
  it('true when the reference solves every board', () => {
    const config = { grid: { w: 3, h: 2 }, boards: [
      { start: [0, 0], goal: [2, 0], walls: [[1, 0], [0, 1]] },
      { start: [0, 0], goal: [2, 0], walls: [] },
    ] };
    assert.equal(solvesAllBoards('maze', config, prog), true);
  });
  it('false when a board is unsolved', () => {
    const config = { grid: { w: 3, h: 2 }, boards: [
      { start: [0, 0], goal: [2, 0], walls: [[1, 0], [0, 1]] },
      { start: [0, 0], goal: [9, 9], walls: [] }, // impossible goal
    ] };
    assert.equal(solvesAllBoards('maze', config, prog), false);
  });
  it('single board when boards absent', () => {
    assert.equal(solvesAllBoards('maze', { grid: { w: 3, h: 1 }, start: [0, 0], goal: [2, 0], walls: [] },
      [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }]), true);
  });
});
```

(Note the walls chosen so the reference truly solves board A — mirror the generator's output when finalizing.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/db exec node --import tsx --test prisma/publish-boards.test.mts`
Expected: FAIL — `solvesAllBoards` not exported.

- [ ] **Step 3: Refactor `publish.mts`** — extract per-board `solves` and add the boards wrapper

`solves(world, config, program)` in publish.mts already simulates one board. Add above `main`:

```ts
function boardsFor(config: any): any[] {
  const c = config ?? {};
  if (!Array.isArray(c.boards) || c.boards.length === 0) return [c];
  return c.boards.map((b: any) => ({ ...c, ...b, boards: undefined }));
}
export function solvesAllBoards(world: string, config: any, program: any[]): boolean {
  const boards = boardsFor(config);
  return boards.length > 0 && boards.every((b) => solves(world, b, program));
}
```

Then in `main`, replace the code-confirm line `if (solves(r.subMode, r.config, r.answer))` with `if (solvesAllBoards(r.subMode, r.config, r.answer))`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @gabee/db exec node --import tsx --test prisma/publish-boards.test.mts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/publish.mts packages/db/prisma/publish-boards.test.mts
git commit -m "feat(db/code): publish confirms multi-board conditions (all boards must solve)"
```

---

## Task 6: Conditions generator + forcing check

**Files:**
- Create: `packages/db/prisma/author-conditions.mts`
- Test: `packages/db/prisma/author-conditions.test.mts`

**Interfaces:**
- Produces: `solves(world, config, program)` (embedded, mirrors publish), `isForcing(world, config, refAnswer): boolean` (collapsing the if to then-only AND else-only each fails ≥1 board), `generate(world): Record<string, unknown>[]`.

- [ ] **Step 1: Write the failing test** — `author-conditions.test.mts`

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solves, isForcing, type World } from './author-conditions.mjs';

const WORLDS: World[] = ['maze', 'actions'];
describe('generated conditions puzzles', () => {
  for (const world of WORLDS) {
    it(`${world}: >=20 puzzles, each solvable on all boards + forcing`, () => {
      const qs = generate(world);
      assert.ok(qs.length >= 20, `${world}: ${qs.length}`);
      const ids = new Set<string>();
      for (const q of qs) {
        ids.add(q.id as string);
        const cfg = q.config as never; const ans = q.answer as never[];
        const boards = (q.config as { boards: unknown[] }).boards;
        assert.ok(Array.isArray(boards) && boards.length >= 2, `${q.id} needs >=2 boards`);
        assert.ok(solves(world, cfg, ans), `${q.id} does not solve all boards`);
        assert.ok(isForcing(world, cfg, ans), `${q.id} branch is not required`);
      }
      assert.equal(ids.size, qs.length);
    });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/db exec node --import tsx --test prisma/author-conditions.test.mts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `author-conditions.mts`**

Full generator. The template: from `start`, sense `wall_right`; **board A** walls the straight path (forces the then detour) and walls the else route’s continuation; **board B** walls the detour (forces the else straight). Both reach `goal`. `isForcing` = then-only fails ≥1 board AND else-only fails ≥1 board.

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type World = 'maze' | 'actions';
type Op = { op: string; dir?: string; cond?: string; then?: Op[]; else?: Op[] };
type XY = { x: number; y: number };
const DELTA: Record<string, XY> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const eq = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const cell = (a: number[]): XY => ({ x: a[0]!, y: a[1]! });

// Embedded solver over ALL boards (mirrors publish.mts).
function solveBoard(world: World, c: any, program: Op[]): boolean {
  const w = c.grid.w, h = c.grid.h;
  let pos = cell(c.start); let carrying: number | null = null, wasted = 0;
  const items: XY[] = (c.items ?? []).map(cell);
  const walls: XY[] = (c.walls ?? []).map(cell);
  const inGrid = (p: XY) => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h;
  const blocked = (p: XY) => !inGrid(p) || walls.some((q) => eq(q, p));
  const exec = (ops: Op[]): void => {
    for (const op of ops) {
      if (op.op === 'move') { const d = DELTA[op.dir!]!; const n = { x: pos.x + d.x, y: pos.y + d.y };
        if (blocked(n)) wasted++; else { pos = n; if (carrying !== null) items[carrying] = { ...pos }; } }
      else if (op.op === 'pick') { const i = items.findIndex((it, j) => j !== carrying && eq(it, pos)); if (carrying !== null || i < 0) wasted++; else carrying = i; }
      else if (op.op === 'drop') { if (carrying === null) wasted++; else carrying = null; }
      else if (op.op === 'if') { const m = String(op.cond).split('_')[1]!; const d = DELTA[m] ?? { x: 0, y: 0 };
        exec(blocked({ x: pos.x + d.x, y: pos.y + d.y }) ? op.then! : (op.else ?? [])); }
    }
  };
  exec(program);
  if (world === 'maze') return wasted === 0 && eq(pos, cell(c.goal));
  const targets: XY[] = (c.targets ?? []).map(cell);
  return carrying === null && targets.length === items.length &&
    items.map((p) => `${p.x},${p.y}`).sort().join('|') === targets.map((p) => `${p.x},${p.y}`).sort().join('|');
}
function boardsOf(c: any): any[] { return c.boards.map((b: any) => ({ ...c, ...b })); }
export function solves(world: World, c: any, program: Op[]): boolean { return boardsOf(c).every((b) => solveBoard(world, b, program)); }

/** then-only and else-only must EACH fail at least one board → the branch is required. */
export function isForcing(world: World, c: any, program: Op[]): boolean {
  const iff = program.find((o) => o.op === 'if') as Op | undefined;
  if (!iff) return false;
  const before = program.slice(0, program.indexOf(iff));
  const after = program.slice(program.indexOf(iff) + 1);
  const thenOnly = [...before, ...(iff.then ?? []), ...after];
  const elseOnly = [...before, ...(iff.else ?? []), ...after];
  const boards = boardsOf(c);
  const thenFails = boards.some((b) => !solveBoard(world, b, thenOnly));
  const elseFails = boards.some((b) => !solveBoard(world, b, elseOnly));
  return thenFails && elseFails;
}

const BLOCKS: Record<World, string[]> = {
  maze: ['up', 'down', 'left', 'right', 'if'],
  actions: ['up', 'down', 'left', 'right', 'if', 'pick', 'drop'],
};

/**
 * Canonical forcing pair on a 3-wide, 2-tall strip (parameter L = straight length):
 *   start [0,0], goal [L,0].
 *   Board A: wall at [1,0] (straight blocked → detour down), row-1 clear for the detour.
 *   Board B: wall at [0,1] (detour blocked → straight), row-0 clear.
 *   then  = down, right×L, up     ; else = right×L
 */
function forcingMaze(idx: number, L: number): Record<string, unknown> | null {
  const straight: Op[] = Array.from({ length: L }, () => ({ op: 'move', dir: 'right' }));
  const detour: Op[] = [{ op: 'move', dir: 'down' }, ...Array.from({ length: L }, () => ({ op: 'move', dir: 'right' })), { op: 'move', dir: 'up' }];
  const answer: Op[] = [{ op: 'if', cond: 'wall_right', then: detour, else: straight }];
  const config = {
    grid: { w: L + 1, h: 2 }, concept: 'conditions', blocks: BLOCKS.maze,
    boards: [
      { start: [0, 0], goal: [L, 0], walls: [[1, 0]] },
      { start: [0, 0], goal: [L, 0], walls: [[0, 1]] },
    ],
  };
  if (!solves('maze', config, answer) || !isForcing('maze', config, answer)) return null;
  return mk('maze', idx, answer, config);
}
function forcingActions(idx: number, L: number): Record<string, unknown> | null {
  // Same fork, but carry an item from start to goal: pick, if(detour/straight), drop.
  const straight: Op[] = Array.from({ length: L }, () => ({ op: 'move', dir: 'right' }));
  const detour: Op[] = [{ op: 'move', dir: 'down' }, ...Array.from({ length: L }, () => ({ op: 'move', dir: 'right' })), { op: 'move', dir: 'up' }];
  const answer: Op[] = [{ op: 'pick' }, { op: 'if', cond: 'wall_right', then: detour, else: straight }, { op: 'drop' }];
  const config = {
    grid: { w: L + 1, h: 2 }, concept: 'conditions', blocks: BLOCKS.actions,
    boards: [
      { start: [0, 0], items: [[0, 0]], targets: [[L, 0]], walls: [[1, 0]] },
      { start: [0, 0], items: [[0, 0]], targets: [[L, 0]], walls: [[0, 1]] },
    ],
  };
  if (!solves('actions', config, answer) || !isForcing('actions', config, answer)) return null;
  return mk('actions', idx, answer, config);
}
function mk(world: World, idx: number, answer: Op[], config: Record<string, unknown>): Record<string, unknown> {
  const prompt = world === 'maze'
    ? { fr: "Un seul programme pour les deux labyrinthes !", en: 'One program for both mazes!' }
    : { fr: "Un seul programme pour livrer sur les deux plateaux !", en: 'One program to deliver on both boards!' };
  return {
    id: `code-${world}-cond-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: world, level: 4, lesson: 1, theme: 'conditions', type: 'code-grid',
    objective_ref: '4', prompt, answer, distractors: [],
    hint: { fr: 'Si mur → sinon.', en: 'If wall → else.' }, lang: 'both', difficulty: 3, age_min: 7, age_max: 9,
    concept_tags: ['conditions', world], config, created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

export function generate(world: World): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  for (let rep = 0; rep < 5; rep++) for (let L = 2; L <= 6; L++) { // 25 per world
    const q = world === 'maze' ? forcingMaze(idx, L) : forcingActions(idx, L);
    if (q) { out.push(q); idx++; }
  }
  return out;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'seed-data', 'code.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { questions: Record<string, unknown>[] };
  const removed: Record<string, number> = {};
  doc.questions = doc.questions.filter((q) => {
    const drop = q.level === 4 && (q.sub_mode === 'maze' || q.sub_mode === 'actions');
    if (drop) removed[q.sub_mode as string] = (removed[q.sub_mode as string] ?? 0) + 1;
    return !drop;
  });
  const added: Record<string, number> = {};
  for (const world of ['maze', 'actions'] as World[]) { const g = generate(world); doc.questions.push(...g); added[world] = g.length; }
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log('Removed single-board L4:', removed, 'Added forcing L4:', added);
  const pools: Record<string, number> = {};
  for (const q of doc.questions) if (q.level === 4) pools[q.sub_mode as string] = (pools[q.sub_mode as string] ?? 0) + 1;
  console.log('L4 pools:', pools);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
```

**Note on the fork geometry (verify during Step 4):** for the else route (straight, row 0) the detour must be blocked on board B, and for the then route (down to row 1, across, back up) the straight must be blocked on board A. The `solves` + `isForcing` gates in `generate` reject any `(world, L)` that doesn't satisfy both — if a length produces no puzzle it's silently skipped, so confirm ≥20 survive per world in Step 5. If a wall placement over-blocks (e.g. `[1,0]` also blocks the detour's first right at row 0 — it doesn't, the detour is on row 1), the gate catches it.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @gabee/db exec node --import tsx --test prisma/author-conditions.test.mts`
Expected: PASS (≥20 per world, all solvable + forcing). If a world yields <20, widen the `L`/`rep` ranges or add a second template (e.g. sense `wall_down`, vertical fork) until ≥20 survive.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/author-conditions.mts packages/db/prisma/author-conditions.test.mts
git commit -m "feat(db/code): forcing multi-board conditions generator (self-verified)"
```

---

## Task 7: Run generator, replace L4 content, reseed + publish

**Files:**
- Modify: `packages/db/prisma/seed-data/code.json`

- [ ] **Step 1: Ensure the worktree DB env exists** (fresh worktree needs it)

```bash
cp /Users/valentine/dev/gabee/packages/db/.env /Users/valentine/dev/gabee/.worktrees/slice2/packages/db/.env 2>/dev/null || true
cd /Users/valentine/dev/gabee/.worktrees/slice2 && pnpm --filter @gabee/db exec prisma generate
```
Expected: Prisma client generated (see [project_worktree_setup]).

- [ ] **Step 2: Run the generator**

Run: `pnpm --filter @gabee/db exec tsx prisma/author-conditions.mts`
Expected: removes single-board maze/actions L4, adds ≥20 forcing per world; prints L4 pools ≥ 20.

- [ ] **Step 3: Validate**

Run: `pnpm --filter @gabee/db exec tsx prisma/validate-seed.mts`
Expected: PASS (all rows parse; ids unique).

- [ ] **Step 4: Reseed + publish**

```bash
pnpm --filter @gabee/db db:seed
pnpm --filter @gabee/db exec tsx prisma/publish.mts
```
Expected: `✓ Code: confirmed N/N solvable` with **0 held** for maze/actions L4 (the multi-board solver confirms each authored conditions question). Any held → fix the generator/board walls and re-run Steps 2–4.

- [ ] **Step 5: Manual sanity (optional, headless-permitting)**

Run the kid app; open a maze L4 session; confirm two boards render side by side, the `if` block places with a condition selector + then/else, and one if/else program wins both boards while a single-branch program fails one.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/seed-data/code.json
git commit -m "content(code): replace single-board L4 with forcing multi-board conditions (maze + actions)"
```

---

## Self-Review

**Spec coverage:**
- Content model `config.boards` (additive) → Task 2 (`boardsFor`) + Task 6 (authoring). ✅
- Runtime `runBoards` → Task 2. ✅
- Side-by-side renderer + lockstep run → Task 4. ✅
- `if`/`else` editor (condition selector + then/else slots) → Task 1 (model) + Task 3 (UI). ✅
- Publish multi-board → Task 5. ✅
- Forcing generator → Task 6; run/replace/reseed/publish → Task 7. ✅
- Non-goals respected: no nesting (branches primitive-only), no draw, wall sensor only, no budget on L4. ✅

**Placeholder scan:** No TBD/TODO. The Task 4/Task 5 fixtures carry a "mirror the generator output" note — that's a real instruction (regenerate the exact board walls from Task 6), not a deferred blank; the generator's `solves`+`isForcing` gates make the correct walls deterministic.

**Type consistency:** `ProgramState` gains `slot`; `active` stays `number | null` so Slice 1 loop code (`prog.active === i`) is untouched. `addIf`/`setCond`/`setSlot`/`removeInside`/`Cond`/`Slot` names match across Task 1 (def), Task 3 (import + use). `boardsFor`/`runBoards`/`BoardsResult` match Task 2 ↔ Task 4. `solvesAllBoards` matches Task 5 ↔ its test. `solves`/`isForcing`/`generate`/`World` match Task 6 def ↔ test ↔ Task 7 usage.

**Risks:** (1) lockstep animation across boards of unequal frame length — shorter boards clamp to last frame (handled). (2) fork geometry must satisfy both `solves` and `isForcing`; the generator gates reject bad lengths, and Task 6 Step 4 says widen ranges / add a template if <20 survive. (3) `publish.mts` `boardsFor` duplicates the app's — kept in sync by mirroring the same 3-line logic; noted in both files.
