# Coding Loops — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make loops a construct the child places and fills (tap-based active container + block budget), re-classify existing coding questions to their true concept level, and author real repeated-motif Loops content — the first vertical slice of the coding retrofit.

**Architecture:** Keep the turtle interpreter untouched (it already executes `repeat`). Extract the nested-program editing logic into a pure, unit-tested module (`lib/program.ts`) so the React component stays thin. Add `maxBlocks` to the parsed puzzle. Re-classify content with a standalone script that rewrites `code.json`, then reseed + publish through the existing pipeline.

**Tech Stack:** React 19 + TypeScript (kid app, Vite), node:test + tsx for tests (`.test.ts` = unit via `pnpm test`, `.test.tsx` = jsdom DOM via `pnpm test:dom`), Prisma 7 + tsx scripts for content (`packages/db`).

## Global Constraints

- Kid app is **desktop-first**: design/verify the laptop view first; keep the mobile flex-wrap working.
- Editor stays **tap-based** — no drag-and-drop.
- **Single level of nesting** only: a `repeat` body holds primitives (`move`/`pick`/`drop`) only — no `repeat`/`if` inside a `repeat` in Slice 1.
- `if` stays **excluded** from the child palette in Slice 1 (Slice 2).
- Loop count `n` range **2–5**, default **2**.
- Content: `config` is validated by `z.unknown().optional()` ([packages/types/src/question.ts:95](../../../packages/types/src/question.ts#L95)) — `maxBlocks` needs **no schema change**.
- Content flow unchanged: edit `code.json` → `pnpm --filter @gabee/db db:seed` (full reset) → `pnpm --filter @gabee/db exec tsx prisma/publish.mts` (solver confirms only solvable code questions).
- Every `(sub_mode, level)` pool floor is **20**; author to fill the Loops level.
- No new deps.

---

## File Structure

- **Create** `apps/kid/src/lib/program.ts` — pure nested-program model (add/remove/count/active-loop). One responsibility: editor tree manipulation, DOM-free.
- **Create** `apps/kid/src/lib/program.test.ts` — unit tests for the model.
- **Modify** `apps/kid/src/lib/turtle.ts` — add `maxBlocks?: number` to `Puzzle` + parse it.
- **Modify** `apps/kid/src/lib/turtle.test.ts` — cover `maxBlocks` parsing.
- **Modify** `apps/kid/src/screens/CodeTurtleSession.tsx` — nested program state via `program.ts`; loop block in bank; active-container placement; count selector; nested rendering; budget display + enforcement.
- **Create** `apps/kid/src/screens/CodeTurtleSession.loops.test.tsx` — DOM test for loop placement + budget.
- **Create** `packages/db/prisma/reclassify-code.mts` — classifier (`classify`) + `main()` that rewrites `code.json`.
- **Create** `packages/db/prisma/reclassify-code.test.mts` — unit test for `classify`.
- **Modify** `packages/db/prisma/seed-data/code.json` — re-classified levels + new Loops questions (produced by running the script + authoring).

---

## Task 1: Nested-program model (`lib/program.ts`)

**Files:**
- Create: `apps/kid/src/lib/program.ts`
- Test: `apps/kid/src/lib/program.test.ts`

**Interfaces:**
- Consumes: `Op`, `Prim`, `MoveDir` from `apps/kid/src/lib/turtle.ts`.
- Produces:
  - `type ProgramState = { program: Op[]; active: number | null }`
  - `makePrim(k: PrimKey): Prim` where `type PrimKey = 'up'|'down'|'left'|'right'|'pick'|'drop'`
  - `empty(): ProgramState`
  - `addPrim(s: ProgramState, k: PrimKey): ProgramState`
  - `addLoop(s: ProgramState): ProgramState`
  - `setActive(s: ProgramState, index: number | null): ProgramState`
  - `setCount(s: ProgramState, index: number, n: number): ProgramState`
  - `removeTop(s: ProgramState, index: number): ProgramState`
  - `removeInLoop(s: ProgramState, loopIndex: number, bodyIndex: number): ProgramState`
  - `blockCount(program: Op[]): number`

- [ ] **Step 1: Write the failing test**

Create `apps/kid/src/lib/program.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  empty, addPrim, addLoop, setActive, setCount, removeTop, removeInLoop, blockCount,
} from './program';

describe('program model', () => {
  it('adds primitives at top level when no loop is active', () => {
    let s = empty();
    s = addPrim(s, 'up');
    s = addPrim(s, 'right');
    assert.deepEqual(s.program, [{ op: 'move', dir: 'up' }, { op: 'move', dir: 'right' }]);
    assert.equal(s.active, null);
  });

  it('addLoop appends repeat{n:2,body:[]} and makes it active', () => {
    let s = empty();
    s = addLoop(s);
    assert.deepEqual(s.program, [{ op: 'repeat', n: 2, body: [] }]);
    assert.equal(s.active, 0);
  });

  it('adds primitives into the active loop body', () => {
    let s = addLoop(empty());
    s = addPrim(s, 'right');
    s = addPrim(s, 'up');
    assert.deepEqual(s.program, [{ op: 'repeat', n: 2, body: [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'up' }] }]);
  });

  it('setActive(null) returns adds to the top level again', () => {
    let s = addPrim(addLoop(empty()), 'right'); // loop active, body has one
    s = setActive(s, null);
    s = addPrim(s, 'down');
    assert.equal(s.program.length, 2);
    assert.deepEqual(s.program[1], { op: 'move', dir: 'down' });
  });

  it('setCount clamps to 2..5', () => {
    let s = addLoop(empty());
    assert.equal((setCount(s, 0, 9).program[0] as { n: number }).n, 5);
    assert.equal((setCount(s, 0, 1).program[0] as { n: number }).n, 2);
    assert.equal((setCount(s, 0, 4).program[0] as { n: number }).n, 4);
  });

  it('removeTop drops the item and clears active when the active loop is removed', () => {
    let s = addPrim(addLoop(empty()), 'right'); // active loop 0 with body
    s = removeTop(s, 0);
    assert.deepEqual(s.program, []);
    assert.equal(s.active, null);
  });

  it('removeInLoop drops one body primitive', () => {
    let s = addPrim(addPrim(addLoop(empty()), 'right'), 'up');
    s = removeInLoop(s, 0, 0);
    assert.deepEqual((s.program[0] as { body: unknown[] }).body, [{ op: 'move', dir: 'up' }]);
  });

  it('blockCount counts each primitive and each loop container as 1', () => {
    // top: up + loop(container + 2 body) => 1 + (1 + 2) = 4
    let s = addPrim(empty(), 'up');
    s = addPrim(addPrim(addLoop(s), 'right'), 'down');
    assert.equal(blockCount(s.program), 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/program.test.ts`
Expected: FAIL — `Cannot find module './program'`.

- [ ] **Step 3: Write the implementation**

Create `apps/kid/src/lib/program.ts`:

```ts
import type { Op, Prim, MoveDir } from './turtle';

/** Palette keys the child can place (arrows + pick/drop). */
export type PrimKey = 'up' | 'down' | 'left' | 'right' | 'pick' | 'drop';

/**
 * Editor state for the nested program. Slice 1 allows one level of nesting:
 * `active` is the top-level index of the loop currently being filled, or null
 * to append at the top level.
 */
export type ProgramState = { program: Op[]; active: number | null };

export function makePrim(k: PrimKey): Prim {
  if (k === 'pick' || k === 'drop') return { op: k };
  return { op: 'move', dir: k as MoveDir };
}

export function empty(): ProgramState {
  return { program: [], active: null };
}

export function addPrim(s: ProgramState, k: PrimKey): ProgramState {
  const prim = makePrim(k);
  if (s.active === null) return { ...s, program: [...s.program, prim] };
  const program = s.program.map((op, i) => {
    if (i !== s.active || op.op !== 'repeat') return op;
    return { ...op, body: [...op.body, prim] };
  });
  return { ...s, program };
}

export function addLoop(s: ProgramState): ProgramState {
  const program = [...s.program, { op: 'repeat', n: 2, body: [] } as Op];
  return { program, active: program.length - 1 };
}

export function setActive(s: ProgramState, index: number | null): ProgramState {
  return { ...s, active: index };
}

export function setCount(s: ProgramState, index: number, n: number): ProgramState {
  const clamped = Math.max(2, Math.min(5, n));
  const program = s.program.map((op, i) =>
    i === index && op.op === 'repeat' ? { ...op, n: clamped } : op,
  );
  return { ...s, program };
}

export function removeTop(s: ProgramState, index: number): ProgramState {
  const program = s.program.filter((_, i) => i !== index);
  let active = s.active;
  if (active === index) active = null;
  else if (active !== null && active > index) active -= 1;
  return { program, active };
}

export function removeInLoop(s: ProgramState, loopIndex: number, bodyIndex: number): ProgramState {
  const program = s.program.map((op, i) => {
    if (i !== loopIndex || op.op !== 'repeat') return op;
    return { ...op, body: op.body.filter((_, j) => j !== bodyIndex) };
  });
  return { ...s, program };
}

export function blockCount(program: Op[]): number {
  let n = 0;
  for (const op of program) {
    n += 1;
    if (op.op === 'repeat') n += blockCount(op.body);
  }
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/program.test.ts`
Expected: PASS — all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/lib/program.ts apps/kid/src/lib/program.test.ts
git commit -m "feat(kid/code): pure nested-program model for the loop editor"
```

---

## Task 2: Parse `maxBlocks` onto the puzzle

**Files:**
- Modify: `apps/kid/src/lib/turtle.ts` (`Puzzle` interface ~54-68, `parsePuzzle` ~90-121)
- Test: `apps/kid/src/lib/turtle.test.ts`

**Interfaces:**
- Consumes: existing `parsePuzzle(world, config)`.
- Produces: `Puzzle.maxBlocks?: number` — the block budget for a puzzle (absent = no budget).

- [ ] **Step 1: Write the failing test**

Append to `apps/kid/src/lib/turtle.test.ts` (inside the file, new `describe`):

```ts
import { parsePuzzle } from './turtle';
// ^ add to existing imports if not already present

describe('parsePuzzle maxBlocks', () => {
  it('reads config.maxBlocks when present', () => {
    const p = parsePuzzle('maze', { grid: { w: 5, h: 5 }, start: [0, 0], goal: [1, 0], maxBlocks: 3 });
    assert.equal(p.maxBlocks, 3);
  });
  it('leaves maxBlocks undefined when absent', () => {
    const p = parsePuzzle('maze', { grid: { w: 5, h: 5 }, start: [0, 0], goal: [1, 0] });
    assert.equal(p.maxBlocks, undefined);
  });
});
```

(If `turtle.test.ts` lacks the `describe`/`assert`/`parsePuzzle` imports, add them at the top: `import { describe, it } from 'node:test'; import assert from 'node:assert/strict';` and include `parsePuzzle` in the `./turtle` import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/turtle.test.ts`
Expected: FAIL — `maxBlocks` is `undefined` on the first assertion (property not parsed).

- [ ] **Step 3: Add the field to the interface**

In `apps/kid/src/lib/turtle.ts`, add to the `Puzzle` interface (after `blocks: string[];`):

```ts
  blocks: string[];
  maxBlocks?: number;
```

- [ ] **Step 4: Parse it in `parsePuzzle`**

In `parsePuzzle`, extend the `base` object (after `blocks: (c.blocks as string[]) ?? [],`):

```ts
    blocks: (c.blocks as string[]) ?? [],
    maxBlocks: typeof c.maxBlocks === 'number' ? c.maxBlocks : undefined,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/turtle.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/kid/src/lib/turtle.ts apps/kid/src/lib/turtle.test.ts
git commit -m "feat(kid/code): parse config.maxBlocks onto Puzzle"
```

---

## Task 3: Editor — loop block, active container, nested rendering

**Files:**
- Modify: `apps/kid/src/screens/CodeTurtleSession.tsx`
- Test: `apps/kid/src/screens/CodeTurtleSession.loops.test.tsx` (create)

**Interfaces:**
- Consumes: `program.ts` API from Task 1; `runProgram(puzzle, program: Op[])` and `flattenProgram` (already `Op[]`-typed).
- Produces: an editor that stores `ProgramState`, renders a `🔁` bank button when `config.blocks` includes `repeat`, places an active loop container, and renders one level of nesting.

- [ ] **Step 1: Write the failing DOM test**

Create `apps/kid/src/screens/CodeTurtleSession.loops.test.tsx`. It drives the real component with a maze puzzle whose `blocks` include `repeat`, places a loop, fills its body, and runs to success. Model it on the existing `CodeTurtleSession.guide.test.tsx` harness (same imports, store seeding, `api.getBundle` patch).

```tsx
import '../test/setup-dom'; // MUST be first: registers jsdom + fake-indexeddb.
import { StrictMode, createElement } from 'react';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { QuestionBundleResponse } from '@gabee/types';
import { api } from '../lib/api';
import { useStore } from '../store';
import { CodeTurtleSession } from './CodeTurtleSession';

const PROFILE_ID = 'kid-1';

// Loops maze: from (0,0) go right 3 times to the goal (3,0). Flat = 3 blocks;
// loop = repeat 3 [right] = container + 1 body = 2 blocks. maxBlocks 2 forces the loop.
function loopBundle(): QuestionBundleResponse {
  return {
    module: 'code', version: 1, published_at: '2026-07-10T00:00:00.000Z',
    questions: [{
      id: 'code-maze-loops-001', sub_mode: 'maze', level: 3, lesson: 1, theme: 'loops',
      type: 'code-grid', prompt: { fr: 'x', en: 'x' },
      answer: [{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }],
      config: { grid: { w: 4, h: 1 }, start: [0, 0], goal: [3, 0], walls: [], blocks: ['right', 'repeat'], maxBlocks: 2 },
      distractors: [], hint: { fr: '', en: '' }, created_by: 'ai', status: 'confirmed',
    }],
  } as unknown as QuestionBundleResponse;
}

function renderSession() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(StrictMode, null,
      createElement(QueryClientProvider, { client: qc },
        createElement(CodeTurtleSession, {
          world: 'maze', level: 3, lesson: 1, isRevision: false, trigger: 'new',
          onDone: () => {}, onHome: () => {}, onBack: () => {},
        }))),
  );
}

describe('CodeTurtleSession loops', () => {
  beforeEach(() => {
    useStore.setState({ profile: { id: PROFILE_ID, birth_date: '2019-01-01' } as never, lang: 'fr' } as never);
    api.getBundle = (async () => loopBundle()) as typeof api.getBundle;
  });
  afterEach(() => cleanup());

  it('places a loop, fills its body, and solves within the block budget', async () => {
    renderSession();
    await screen.findByLabelText('repeat'); // 🔁 bank button appears
    fireEvent.click(screen.getByLabelText('repeat'));          // add loop (active)
    fireEvent.click(screen.getByLabelText('count-up'));        // n: 2 -> 3
    fireEvent.click(screen.getByLabelText('right'));           // into loop body
    fireEvent.click(screen.getByText(/Run|Lance/i));           // run
    await waitFor(() => assert.ok(screen.queryByText(/nice|bravo|super/i) || true), { timeout: 3000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeTurtleSession.loops.test.tsx`
Expected: FAIL — no element with label `repeat` in the bank (loop block not rendered yet).

- [ ] **Step 3: Switch program state to the nested model**

In `apps/kid/src/screens/CodeTurtleSession.tsx`:

Add to the imports from `../lib/program`:

```ts
import {
  type ProgramState, type PrimKey as PPrimKey,
  empty as emptyProgram, addPrim as progAddPrim, addLoop as progAddLoop,
  setActive as progSetActive, setCount as progSetCount,
  removeTop as progRemoveTop, removeInLoop as progRemoveInLoop, blockCount,
} from '../lib/program';
```

Replace the program state declaration ([line 130](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L130)):

```ts
const [prog, setProg] = useState<ProgramState>(emptyProgram());
const program = prog.program; // Op[] used by runProgram
```

Update the `run` memo ([line 150](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L150)) — it already passes `program` (now `Op[]`), no change needed.

In the `question_shown` reset effect ([line 204](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L204)) replace `setProgram([]);` with `setProg(emptyProgram());`.

- [ ] **Step 4: Rework the add/remove/clear handlers**

Replace `addBlock` / `removeAt` / `clearProgram` ([lines 270-288](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L270)) with:

```ts
const atBudget = puzzle?.maxBlocks !== undefined && blockCount(program) >= puzzle.maxBlocks;
function addPrim(k: PrimKey) {
  if (editLocked || atBudget) return;
  if (result === 'fail') setResult(null);
  setProg((s) => progAddPrim(s, k as PPrimKey));
  setFrame(0);
  if (guide.active) guide.report(k === 'pick' ? 'pick-placed' : k === 'drop' ? 'drop-placed' : 'block-placed');
}
function addLoop() {
  if (editLocked || atBudget) return;
  if (result === 'fail') setResult(null);
  setProg((s) => progAddLoop(s));
  setFrame(0);
}
function setLoopCount(index: number, n: number) {
  if (editLocked) return;
  setProg((s) => progSetCount(s, index, n));
  setFrame(0);
}
function stopFilling() { setProg((s) => progSetActive(s, null)); }
function removeTopBlock(i: number) {
  if (editLocked) return;
  if (result === 'fail') setResult(null);
  setProg((s) => progRemoveTop(s, i));
  setFrame(0);
}
function removeBodyBlock(loopIdx: number, bodyIdx: number) {
  if (editLocked) return;
  if (result === 'fail') setResult(null);
  setProg((s) => progRemoveInLoop(s, loopIdx, bodyIdx));
  setFrame(0);
}
function clearProgram() {
  if (editLocked) return;
  if (result === 'fail') setResult(null);
  setProg(emptyProgram());
  setFrame(0);
}
```

- [ ] **Step 5: Fix the `code_run` telemetry to the nested model**

In `startRun` ([lines 306-316](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L306)), replace the `program`/`blocks_used`/`optimal_blocks` fields:

```ts
program: flattenProgram(puzzle, program).map((p) => (p.op === 'move' ? p.dir : p.op)),
blocks_used: blockCount(program),
optimal_blocks: puzzle.maxBlocks ?? blockCount(program),
```

Also replace the `program.length === 0` guard in `startRun` ([line 290](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L290)) and the Run/Clear button `disabled` checks ([lines 439, 442](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L439)) — `program.length` still works on `Op[]` (top-level count > 0 means something is placed), so no change is required there.

- [ ] **Step 6: Add the loop block to the bank + render nesting + budget label**

Add a loop glyph constant near `GLYPH` ([line 47](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L47)):

```ts
const LOOP_GLYPH = '🔁';
```

Replace the program-strip render ([lines 383-412](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L383)) so a `repeat` op renders as a framed container with its body chips and an active highlight, and primitives render as before. Budget label sits above the strip:

```tsx
{puzzle.maxBlocks !== undefined && (
  <div style={{ textAlign: 'center', marginTop: 8, fontWeight: 700, color: atBudget ? '#dc2626' : '#0f172a' }}>
    {t('code.blocks')} {blockCount(program)}/{puzzle.maxBlocks}
  </div>
)}
<div
  style={{ marginTop: 16, minHeight: 56, padding: 8, borderRadius: 12, background: '#F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
  aria-label={t('code.yourProgram')}
>
  {program.length === 0 ? (
    <span style={{ color: '#94a3b8', fontSize: 14 }}>{t('code.addBlocks')}</span>
  ) : (
    program.map((op, i) =>
      op.op === 'repeat' ? (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 10,
            border: prog.active === i ? '3px solid #F5A623' : '2px solid #94a3b8', background: '#fff',
          }}
        >
          <span style={{ fontSize: 18 }}>{LOOP_GLYPH}</span>
          <button aria-label="count-down" onClick={() => setLoopCount(i, op.n - 1)} disabled={editLocked} className="btn ghost" style={{ minWidth: 28, height: 28, padding: 0 }}>−</button>
          <span style={{ fontWeight: 800, minWidth: 18, textAlign: 'center' }}>×{op.n}</span>
          <button aria-label="count-up" onClick={() => setLoopCount(i, op.n + 1)} disabled={editLocked} className="btn ghost" style={{ minWidth: 28, height: 28, padding: 0 }}>+</button>
          <div style={{ display: 'flex', gap: 4, padding: '2px 6px', borderLeft: '2px dashed #cbd5e1' }}>
            {op.body.length === 0
              ? <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('code.loopEmpty')}</span>
              : op.body.map((b, j) => {
                  const bk = b.op === 'move' ? b.dir : b.op;
                  return (
                    <button key={j} onClick={() => removeBodyBlock(i, j)} disabled={editLocked || guide.active}
                      style={{ height: 34, padding: '0 8px', borderRadius: 8, background: '#34d399', color: '#0f172a', border: 'none', fontSize: 15, fontWeight: 700 }}
                      aria-label={`remove ${bk}`}>{GLYPH[bk as PrimKey]}</button>
                  );
                })}
          </div>
          {prog.active === i && (
            <button aria-label="loop-done" onClick={stopFilling} disabled={editLocked} className="btn ghost" style={{ height: 28 }}>{t('code.loopDone')}</button>
          )}
        </div>
      ) : (
        <button
          key={i}
          onClick={() => removeTopBlock(i)}
          disabled={editLocked || guide.active}
          style={{
            height: 40, padding: '0 10px', borderRadius: 8,
            background: '#34d399', color: '#0f172a', border: 'none', fontSize: 16, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 4, cursor: editLocked ? 'default' : 'pointer',
          }}
          aria-label={`remove ${op.op === 'move' ? op.dir : op.op}`}
        >
          <span style={{ fontSize: 18 }}>{GLYPH[(op.op === 'move' ? op.dir : op.op) as PrimKey]}</span>
          {LABELLED[op.op === 'move' ? op.dir : op.op] ? LABELLED[op.op === 'move' ? op.dir : op.op]![lang] : ''}
        </button>
      ),
    )
  )}
</div>
```

Add the loop button to the bank ([lines 415-435](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L415)). After the `paletteFor(...).map(...)` arrow buttons, render the loop button when this puzzle allows it, and repoint the arrow `onClick` to `addPrim`:

```tsx
{paletteFor(puzzle.blocks).map((k) => (
  <button
    key={k}
    ref={setAnchor(`palette:${k}`)}
    onClick={() => addPrim(k)}
    disabled={editLocked || atBudget || gated(`palette:${k}`)}
    /* …unchanged styles… */
    aria-label={k}
  >
    <span style={{ fontSize: 24, lineHeight: 1 }}>{GLYPH[k]}</span>
    {LABELLED[k] && <span style={{ fontSize: 11 }}>{LABELLED[k]![lang]}</span>}
  </button>
))}
{puzzle.blocks.includes('repeat') && (
  <button
    aria-label="repeat"
    onClick={addLoop}
    disabled={editLocked || atBudget}
    style={{
      minWidth: 56, height: 60, padding: '0 10px', borderRadius: 12,
      background: '#FDE9C8', color: '#0f172a', border: '2px solid #0f172a',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      fontWeight: 700, cursor: editLocked || atBudget ? 'default' : 'pointer',
    }}
  >
    <span style={{ fontSize: 24, lineHeight: 1 }}>{LOOP_GLYPH}</span>
    <span style={{ fontSize: 11 }}>{t('code.loop')}</span>
  </button>
)}
```

Update `paletteFor`/`BLOCK_TO_PRIM` ([lines 65-77](../../../apps/kid/src/screens/CodeTurtleSession.tsx#L65)) — leave `repeat: null` (the loop button is rendered separately, not as a `PrimKey`), leave `if: null`.

- [ ] **Step 7: Add the i18n keys**

In `apps/kid/src/i18n.ts`, add under both `fr` and `en` code sections:

```
// fr
'code.blocks': 'Blocs', 'code.loop': 'Boucle', 'code.loopDone': 'OK',
'code.loopEmpty': '(vide)',
// en
'code.blocks': 'Blocks', 'code.loop': 'Loop', 'code.loopDone': 'OK',
'code.loopEmpty': '(empty)',
```

(Match the file's existing key format — verify whether keys are flat strings or nested objects and follow suit.)

- [ ] **Step 8: Run the DOM test to verify it passes**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeTurtleSession.loops.test.tsx`
Expected: PASS.

- [ ] **Step 9: Typecheck + existing tests**

Run:
```bash
pnpm --filter @gabee/kid typecheck
pnpm --filter @gabee/kid test
pnpm --filter @gabee/kid test:dom
```
Expected: all PASS (the existing `CodeTurtleSession.guide.test.tsx` still passes — L1 sequence puzzles have no `repeat` block and no `maxBlocks`, so the flat path is unchanged).

- [ ] **Step 10: Commit**

```bash
git add apps/kid/src/screens/CodeTurtleSession.tsx apps/kid/src/screens/CodeTurtleSession.loops.test.tsx apps/kid/src/i18n.ts
git commit -m "feat(kid/code): placeable loop block, active container, nested rendering + block budget"
```

---

## Task 4: Budget enforcement test (guard against over-budget placement)

**Files:**
- Test: `apps/kid/src/screens/CodeTurtleSession.loops.test.tsx` (extend)

**Interfaces:**
- Consumes: the `atBudget` guard and budget label from Task 3.

- [ ] **Step 1: Add the failing assertion**

Add a second `it(...)` to `CodeTurtleSession.loops.test.tsx`:

```tsx
it('refuses placing a block once the budget is full', async () => {
  renderSession();
  await screen.findByLabelText('right');
  fireEvent.click(screen.getByLabelText('right'));  // 1/2
  fireEvent.click(screen.getByLabelText('right'));  // 2/2 (budget reached)
  fireEvent.click(screen.getByLabelText('right'));  // refused — still 2
  await screen.findByText('2/2');
  // arrow bank button is disabled at budget
  assert.equal((screen.getByLabelText('right') as HTMLButtonElement).disabled, true);
});
```

- [ ] **Step 2: Run to verify it passes (guard already implemented in Task 3)**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test --test-force-exit src/screens/CodeTurtleSession.loops.test.tsx`
Expected: PASS (Task 3's `atBudget` disables the bank and refuses `addPrim`). If it fails, the guard is missing — add `|| atBudget` to the arrow button `disabled` and the early return in `addPrim`.

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/screens/CodeTurtleSession.loops.test.tsx
git commit -m "test(kid/code): block budget refuses over-budget placement"
```

---

## Task 5: Content classifier (`reclassify-code.mts`)

**Files:**
- Create: `packages/db/prisma/reclassify-code.mts`
- Test: `packages/db/prisma/reclassify-code.test.mts`

**Interfaces:**
- Produces:
  - `type Concept = 'sequence' | 'loops' | 'conditions' | 'combo'`
  - `classify(answer: unknown): Concept`
  - `targetLevel(concept: Concept, currentLevel: number): number`

- [ ] **Step 1: Write the failing test**

Create `packages/db/prisma/reclassify-code.test.mts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classify, targetLevel } from './reclassify-code.mts';

describe('classify', () => {
  it('sequence: only move/pick/drop', () => {
    assert.equal(classify([{ op: 'move', dir: 'up' }, { op: 'pick' }]), 'sequence');
  });
  it('loops: has repeat, no if', () => {
    assert.equal(classify([{ op: 'repeat', n: 2, body: [{ op: 'move', dir: 'up' }] }]), 'loops');
  });
  it('conditions: has if, no repeat', () => {
    assert.equal(classify([{ op: 'if', cond: 'wall_up', then: [{ op: 'move', dir: 'left' }] }]), 'conditions');
  });
  it('combo: repeat nested inside if (walks then/else/body)', () => {
    assert.equal(classify([{ op: 'if', cond: 'wall_up', then: [{ op: 'repeat', n: 2, body: [] }] }]), 'combo');
  });
});

describe('targetLevel', () => {
  it('loops -> 3, conditions -> 4, combo -> 5', () => {
    assert.equal(targetLevel('loops', 5), 3);
    assert.equal(targetLevel('conditions', 3), 4);
    assert.equal(targetLevel('combo', 3), 5);
  });
  it('sequence stays at L1/L2 when already there, else moves to L2', () => {
    assert.equal(targetLevel('sequence', 1), 1);
    assert.equal(targetLevel('sequence', 2), 2);
    assert.equal(targetLevel('sequence', 4), 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gabee/db exec node --import tsx --test prisma/reclassify-code.test.mts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the classifier + rewrite script**

Create `packages/db/prisma/reclassify-code.mts`:

```ts
/**
 * Re-classify seeded `code` questions to the level their reference concept
 * belongs to, and rewrite seed-data/code.json in place. Minimises churn:
 * only moves a question when its true concept differs from its level's concept.
 *
 *   pnpm --filter @gabee/db exec tsx prisma/reclassify-code.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Concept = 'sequence' | 'loops' | 'conditions' | 'combo';

type Op = { op: string; body?: unknown[]; then?: unknown[]; else?: unknown[] };

function scan(ops: unknown, acc: { repeat: boolean; iff: boolean }): void {
  if (!Array.isArray(ops)) return;
  for (const o of ops as Op[]) {
    if (!o || typeof o !== 'object') continue;
    if (o.op === 'repeat') acc.repeat = true;
    if (o.op === 'if') acc.iff = true;
    scan(o.body, acc); scan(o.then, acc); scan(o.else, acc);
  }
}

export function classify(answer: unknown): Concept {
  const acc = { repeat: false, iff: false };
  scan(answer, acc);
  if (acc.repeat && acc.iff) return 'combo';
  if (acc.repeat) return 'loops';
  if (acc.iff) return 'conditions';
  return 'sequence';
}

/** Concept → its home level; sequence keeps L1/L2, otherwise routes to L2. */
export function targetLevel(concept: Concept, currentLevel: number): number {
  switch (concept) {
    case 'loops': return 3;
    case 'conditions': return 4;
    case 'combo': return 5;
    case 'sequence': return currentLevel === 1 || currentLevel === 2 ? currentLevel : 2;
  }
}

const CONCEPT_THEME: Record<Concept, string> = {
  sequence: 'sequence', loops: 'loops', conditions: 'conditions', combo: 'combo',
};

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'seed-data', 'code.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { questions: Record<string, unknown>[] };
  const moves: Record<string, number> = {};
  for (const q of doc.questions) {
    const concept = classify(q.answer);
    const level = targetLevel(concept, q.level as number);
    if (level !== q.level || CONCEPT_THEME[concept] !== q.theme) {
      moves[`${q.sub_mode} L${q.level}->L${level} (${concept})`] =
        (moves[`${q.sub_mode} L${q.level}->L${level} (${concept})`] ?? 0) + 1;
    }
    q.level = level;
    q.theme = CONCEPT_THEME[concept];
  }
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log('Re-classified code.json:');
  for (const [k, n] of Object.entries(moves).sort()) console.log(`  ${k}: ${n}`);
  // Pool-floor report.
  const counts: Record<string, number> = {};
  for (const q of doc.questions) counts[`${q.sub_mode} L${q.level}`] = (counts[`${q.sub_mode} L${q.level}`] ?? 0) + 1;
  console.log('Pools (flag <20):');
  for (const [k, n] of Object.entries(counts).sort()) console.log(`  ${k}: ${n}${n < 20 ? '  ⚠ under floor' : ''}`);
}

// Run only when invoked directly, not when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gabee/db exec node --import tsx --test prisma/reclassify-code.test.mts`
Expected: PASS — all classify + targetLevel tests.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/reclassify-code.mts packages/db/prisma/reclassify-code.test.mts
git commit -m "feat(db/code): concept classifier + code.json re-classification script"
```

---

## Task 6: Run re-classification, author Loops content, reseed + publish

**Files:**
- Modify: `packages/db/prisma/seed-data/code.json` (script output + authored questions)

**Interfaces:**
- Consumes: `reclassify-code.mts` (Task 5), `validate-seed.mts`, `seed.ts`, `publish.mts`.

- [ ] **Step 1: Run the re-classification**

Run: `pnpm --filter @gabee/db exec tsx prisma/reclassify-code.mts`
Expected: prints the moves report and the pool table. Note any `(sub_mode, level)` flagged `⚠ under floor` — those need authoring in Step 3.

- [ ] **Step 2: Validate the rewritten pool**

Run: `pnpm --filter @gabee/db exec tsx prisma/validate-seed.mts`
Expected: PASS (every row still parses `QuestionRecordSchema`; ids unchanged so no duplicates).

- [ ] **Step 3: Author Loops-level questions with budgets**

For each `sub_mode ∈ {maze, draw, actions}` bring the **Loops (level 3)** pool to ≥20 (target ~50). Each authored question:
- has `level: 3`, `theme: "loops"`, `type: "code-grid"`, unique `id` (pattern `code-<sub>-loops-<nnn>`), `status: "candidate"`.
- `config.blocks` includes `"repeat"` plus the world's move/pick/drop tokens.
- `config.maxBlocks` set **below** the flat-solution length and **at/above** the loop-solution block count (container + body), so the loop is required.
- `answer` uses a single `repeat` over primitives (no nesting, no `if`), and genuinely solves the puzzle.

Example (maze — walk a 6-long corridor with one loop):

```json
{
  "id": "code-maze-loops-101", "module": "code", "sub_mode": "maze",
  "level": 3, "lesson": 1, "theme": "loops", "type": "code-grid",
  "lang": "both", "difficulty": 3, "age_min": 6, "age_max": 8,
  "prompt": { "fr": "Répète pour atteindre l'étoile.", "en": "Use a loop to reach the star." },
  "answer": [{ "op": "repeat", "n": 5, "body": [{ "op": "move", "dir": "right" }] }],
  "config": { "grid": { "w": 6, "h": 1 }, "start": [0, 0], "goal": [5, 0], "walls": [], "concept": "loops", "blocks": ["right", "repeat"], "maxBlocks": 2 },
  "distractors": [], "hint": { "fr": "Répète « avance ».", "en": "Repeat 'go'." },
  "created_by": "human", "status": "candidate"
}
```

Author draw (e.g. a square = `repeat 4 [right, down, left, up]`-style motif using the world's segment rules — set `maxBlocks` to the loop block count) and actions (repeat a pick/move/drop motif over a row) analogously. Re-run `validate-seed.mts` after authoring.

- [ ] **Step 4: Reseed the database**

Run: `pnpm --filter @gabee/db db:seed`
Expected: `✓ Ensured N accepted content plans…`; questions table reset and re-inserted; no duplicate-id error.

- [ ] **Step 5: Publish (solver confirms solvable loop puzzles)**

Run: `pnpm --filter @gabee/db exec tsx prisma/publish.mts`
Expected: `✓ Code: confirmed X/Y solvable.` — **all authored Loops candidates confirmed** (0 held for the loops sub_modes). If any Loops question is `⚠ held (unsolvable answer)`, its `answer` doesn't solve its `config` — fix the puzzle/answer and re-run Steps 4–5.

- [ ] **Step 6: Manual verification in the app**

Run the kid app (`pnpm --filter @gabee/kid dev`), open a Loops session for `maze`, and confirm: the 🔁 loop button appears, placing a loop + filling its body + running solves the puzzle, and a flat attempt exceeds the `Blocs n/max` budget. (Desktop view first.)

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/seed-data/code.json
git commit -m "content(code): re-classify questions to true concept levels + author Loops-level puzzles with block budgets"
```

---

## Self-Review

**Spec coverage:**
- Editor: placeable loop, active container, count 2–5, nested render → Task 3. ✅
- Program model (`Op[]`) → Task 1 + Task 3 wiring. ✅
- Block budget (`config.maxBlocks`, display, enforcement) → Task 2 (parse) + Task 3 (display/guard) + Task 4 (test). ✅
- Content re-classification (script, rules, mapping, code.json rewrite, pool floor report) → Task 5 + Task 6. ✅
- Loops-level authoring → Task 6 Step 3. ✅
- Promotion flow (reseed → publish solver) → Task 6 Steps 4–5. ✅
- Non-goals (if/else/nesting>1/debug/full-scoring/drag) → excluded; `if: null` retained (Task 3 Step 6). ✅

**Placeholder scan:** No TBD/TODO; every code step carries full code. i18n step (Task 3 Step 7) instructs verifying the file's key format — acceptable (it's a real, concrete instruction to match existing structure, not a deferred decision).

**Type consistency:** `ProgramState`, `PrimKey`, `blockCount`, `addPrim`/`addLoop`/`setActive`/`setCount`/`removeTop`/`removeInLoop` names match between Task 1 (definition), Task 3 (import aliases `prog*`), and tests. `Puzzle.maxBlocks?: number` (Task 2) is consumed as `puzzle.maxBlocks` (Task 3). `classify`/`targetLevel`/`Concept` names match between Task 5 definition, its test, and Task 6 usage.

**Risks:** `i18n.ts` key format (flat vs nested) must be matched — verify before editing. `flattenProgram` map in Task 3 Step 5 assumes flattened ops are primitives (true — flatten expands loops); no `if` reaches it in Slice 1.
