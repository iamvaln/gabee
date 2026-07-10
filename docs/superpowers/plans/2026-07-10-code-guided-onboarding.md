# Code Guided Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the first exercise of each Code sub-mode (maze / draw / actions) into an active, gated, step-by-step guided lesson that walks a 5–10-year-old through using all that sub-mode's commands by doing them.

**Architecture:** A small, Code-agnostic guidance engine (pure reducer + persistence in `lib/guide.ts`, thin `useGuide` React hook) drives a data-driven `GuideScript`. The script for a puzzle is generated (`lib/guideScripts.ts`) from that puzzle's **reference answer** (`q.answer`, a flat `Op[]` already shipped in the bundle), flattened to the exact prims a kid places (`flattenProgram` in `lib/turtle.ts`). `CodeTurtleSession` registers anchor elements, gates every non-target control while guided, and reports the kid's actions back to the engine; a `GuidePointer` overlay bounces a 👇 over the current target and the existing bee-coach narrates.

**Tech Stack:** React 18 + TypeScript (Vite), react-i18next, localStorage. Tests for pure logic run under Node's built-in test runner via `tsx` (mirroring `packages/types`). React wiring is verified by `tsc --noEmit` + manual QA — the kid app has no component-test harness and none is introduced here.

## Global Constraints

- Work on branch `feat/code-guided-onboarding` (already checked out). Do NOT work on `main`.
- v1 is **Code only** — its 3 sub-modes maze / draw / actions, guided **per sub-mode**. No other module gets a script.
- Guide shows **once per (profile, sub-mode)**, is skippable, and is re-openable via a "?" help button.
- No audio/TTS exists — meaning is carried by animation + the 👇 pointer + minimal emoji-forward text. All copy is bilingual FR/EN.
- The guide overlays the **real** first puzzle (`level === 1 && lesson === 1 && qIdx === 0`); it introduces no new content.
- Keep the app offline-first: all guide state is localStorage / in-memory; no network calls.
- No `Co-Authored-By` / Claude attribution trailers in any commit.
- localStorage key namespace for "seen": `gabee:guide-seen:${profileId}:${subKey}` where `subKey = "code:" + world`.

---

### Task 1: `flattenProgram` — reference answer → flat prim list

**Files:**
- Modify: `apps/kid/src/lib/turtle.ts` (add exported `flattenProgram`)
- Modify: `apps/kid/package.json` (add a `test` script)
- Test: `apps/kid/src/lib/turtle.test.ts` (create)

**Interfaces:**
- Consumes: existing `Puzzle`, `Prim`, `Op`, `MoveDir` types and the `MOVE_DELTA`/grid helpers in `turtle.ts`.
- Produces: `flattenProgram(puzzle: Puzzle, program: Op[]): Prim[]` — simulates `program` against `puzzle` and returns, in execution order, the flat `Prim[]` a kid would place (expands `repeat`, resolves `if` against simulated wall state). For a flat level-1 answer it returns the answer unchanged.

- [ ] **Step 1: Add the `test` script to `apps/kid/package.json`**

In the `"scripts"` block, add (after `"typecheck"`):

```json
    "test": "node --import tsx --test src/lib/turtle.test.ts src/lib/guide.test.ts src/lib/guideScripts.test.ts",
```

(The `guide`/`guideScripts` files are created in later tasks; Node's test runner tolerates a missing file only if it exists — so until Task 2/3 land, run the single-file form shown in each step's Run command rather than the whole script.)

- [ ] **Step 2: Write the failing test**

Create `apps/kid/src/lib/turtle.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePuzzle, flattenProgram, type Op } from './turtle';

describe('flattenProgram', () => {
  it('returns a flat move answer unchanged', () => {
    const puzzle = parsePuzzle('maze', {
      grid: { w: 5, h: 5 }, start: [0, 4], goal: [2, 3], walls: [],
    });
    const answer: Op[] = [
      { op: 'move', dir: 'right' },
      { op: 'move', dir: 'right' },
      { op: 'move', dir: 'up' },
    ];
    assert.deepEqual(flattenProgram(puzzle, answer), answer);
  });

  it('expands a repeat into repeated prims', () => {
    const puzzle = parsePuzzle('maze', { grid: { w: 5, h: 5 }, start: [0, 0], goal: [3, 0], walls: [] });
    const answer: Op[] = [{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }];
    assert.deepEqual(flattenProgram(puzzle, answer), [
      { op: 'move', dir: 'right' },
      { op: 'move', dir: 'right' },
      { op: 'move', dir: 'right' },
    ]);
  });

  it('keeps pick/drop prims for the actions world', () => {
    const puzzle = parsePuzzle('actions', {
      grid: { w: 3, h: 1 }, start: [0, 0], items: [[1, 0]], targets: [[2, 0]], walls: [],
    });
    const answer: Op[] = [
      { op: 'move', dir: 'right' }, { op: 'pick' },
      { op: 'move', dir: 'right' }, { op: 'drop' },
    ];
    assert.deepEqual(flattenProgram(puzzle, answer), answer);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/kid && node --import tsx --test src/lib/turtle.test.ts`
Expected: FAIL — `flattenProgram` is not exported.

- [ ] **Step 4: Implement `flattenProgram`**

In `apps/kid/src/lib/turtle.ts`, add after `runProgram` (it reuses the same simulation shape). It records each executed leaf prim; `repeat` expands, `if` picks a branch by testing `blocked` at the current position:

```ts
/**
 * Flatten a reference `answer` program into the flat prim sequence a kid would
 * actually place, by simulating it against the puzzle. `repeat` is expanded and
 * `if wall_<dir>` is resolved against the live wall/edge state. Used by the
 * guided-onboarding scripts to point at the exact next arrow/pick/drop. For a
 * flat level-1 answer this is the identity.
 */
export function flattenProgram(puzzle: Puzzle, program: Op[]): Prim[] {
  let pos = { ...puzzle.start };
  let carrying: number | null = null;
  const items = (puzzle.items ?? []).map((c) => ({ ...c }));
  const walls = puzzle.walls ?? [];
  const obstacles = puzzle.obstacles ?? [];
  const blocked = (c: Cell) =>
    !inGrid(c, puzzle.w, puzzle.h) || walls.some((w) => eq(w, c)) || obstacles.some((o) => eq(o, c));

  const out: Prim[] = [];
  const exec = (ops: Op[]): void => {
    for (const op of ops) {
      switch (op.op) {
        case 'move': {
          out.push({ op: 'move', dir: op.dir });
          const d = MOVE_DELTA[op.dir];
          const nxt = { x: pos.x + d.x, y: pos.y + d.y };
          if (!blocked(nxt)) { pos = nxt; if (carrying !== null) items[carrying] = { ...pos }; }
          break;
        }
        case 'pick': {
          out.push({ op: 'pick' });
          const idx = items.findIndex((it, i) => i !== carrying && eq(it, pos));
          if (carrying === null && idx >= 0) carrying = idx;
          break;
        }
        case 'drop':
          out.push({ op: 'drop' });
          if (carrying !== null) carrying = null;
          break;
        case 'repeat':
          for (let i = 0; i < op.n; i++) exec(op.body);
          break;
        case 'if': {
          const m = op.cond.split('_')[1] as MoveDir | undefined;
          const d = m ? MOVE_DELTA[m] : { x: 0, y: 0 };
          exec(blocked({ x: pos.x + d.x, y: pos.y + d.y }) ? op.then : (op.else ?? []));
          break;
        }
      }
    }
  };
  exec(program);
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/kid && node --import tsx --test src/lib/turtle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `cd apps/kid && pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/kid/src/lib/turtle.ts apps/kid/src/lib/turtle.test.ts apps/kid/package.json
git commit -m "feat(kid/guide): flattenProgram — reference answer to flat prim list"
```

---

### Task 2: Guidance engine — pure reducer + persistence (`lib/guide.ts`)

**Files:**
- Create: `apps/kid/src/lib/guide.ts`
- Test: `apps/kid/src/lib/guide.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no React, no Code specifics).
- Produces:
  - `type GuideActionKind = 'block-placed' | 'pick-placed' | 'drop-placed' | 'run-pressed' | 'success'`
  - `interface GuideStep { coach: { fr: string; en: string }; target?: string; advanceOn: GuideActionKind; allow: string[] }`
  - `type GuideScript = GuideStep[]`
  - `interface GuideState { stepIndex: number; done: boolean }`
  - `initGuideState(): GuideState`
  - `advanceGuide(state: GuideState, script: GuideScript, action: GuideActionKind): { state: GuideState; completed: boolean }`
  - `guideSeenKey(profileId: string | null, subKey: string): string`
  - `guideSeen(profileId: string | null, subKey: string): boolean`
  - `markGuideSeen(profileId: string | null, subKey: string): void`

- [ ] **Step 1: Write the failing test**

Create `apps/kid/src/lib/guide.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initGuideState, advanceGuide, type GuideScript } from './guide';

const script: GuideScript = [
  { coach: { fr: 'a', en: 'a' }, advanceOn: 'block-placed', allow: ['palette:right'] },
  { coach: { fr: 'b', en: 'b' }, advanceOn: 'run-pressed', allow: ['run'] },
  { coach: { fr: 'c', en: 'c' }, advanceOn: 'success', allow: [] },
];

describe('advanceGuide', () => {
  it('advances only on the matching action', () => {
    const s0 = initGuideState();
    const wrong = advanceGuide(s0, script, 'run-pressed');
    assert.equal(wrong.state.stepIndex, 0);
    assert.equal(wrong.completed, false);
    const right = advanceGuide(s0, script, 'block-placed');
    assert.equal(right.state.stepIndex, 1);
    assert.equal(right.completed, false);
  });

  it('completes on the last step', () => {
    let s = initGuideState();
    s = advanceGuide(s, script, 'block-placed').state;
    s = advanceGuide(s, script, 'run-pressed').state;
    const last = advanceGuide(s, script, 'success');
    assert.equal(last.completed, true);
    assert.equal(last.state.done, true);
  });

  it('is a no-op once done', () => {
    const done = { stepIndex: 2, done: true };
    const r = advanceGuide(done, script, 'success');
    assert.deepEqual(r.state, done);
    assert.equal(r.completed, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/kid && node --import tsx --test src/lib/guide.test.ts`
Expected: FAIL — cannot find module `./guide`.

- [ ] **Step 3: Implement the engine**

Create `apps/kid/src/lib/guide.ts`:

```ts
/**
 * Guided-onboarding engine (Code v1). Pure and framework-agnostic: a GuideScript
 * is a linear list of steps, each waiting for one kid action before advancing.
 * `advanceGuide` is the whole state machine; `useGuide` (separate file) is a thin
 * React wrapper. Persistence marks a (profile, sub-mode) guide as seen so it shows
 * once. See docs/superpowers/specs/2026-07-10-code-guided-onboarding-design.md.
 */

export type GuideActionKind =
  | 'block-placed'  // a move arrow was added to the program
  | 'pick-placed'   // the ✋ pick command was added
  | 'drop-placed'   // the 📥 drop command was added
  | 'run-pressed'   // ▶ Run pressed
  | 'success';      // the run succeeded

export interface GuideStep {
  /** Bilingual coach line, rendered by lang at display time. */
  coach: { fr: string; en: string };
  /** Anchor key of the element the 👇 pointer targets (see session anchors). */
  target?: string;
  /** The action that advances to the next step. */
  advanceOn: GuideActionKind;
  /** Interactive anchor keys enabled this step; everything else is gated off. */
  allow: string[];
}

export type GuideScript = GuideStep[];

export interface GuideState {
  stepIndex: number;
  done: boolean;
}

export function initGuideState(): GuideState {
  return { stepIndex: 0, done: false };
}

/**
 * Advance the guide if `action` matches the current step's `advanceOn`.
 * Returns the next state and whether the guide just completed (last step matched).
 */
export function advanceGuide(
  state: GuideState,
  script: GuideScript,
  action: GuideActionKind,
): { state: GuideState; completed: boolean } {
  if (state.done) return { state, completed: false };
  const step = script[state.stepIndex];
  if (!step || action !== step.advanceOn) return { state, completed: false };
  const isLast = state.stepIndex >= script.length - 1;
  if (isLast) return { state: { stepIndex: state.stepIndex, done: true }, completed: true };
  return { state: { stepIndex: state.stepIndex + 1, done: false }, completed: false };
}

export function guideSeenKey(profileId: string | null, subKey: string): string {
  return `gabee:guide-seen:${profileId ?? 'anon'}:${subKey}`;
}

export function guideSeen(profileId: string | null, subKey: string): boolean {
  try {
    return localStorage.getItem(guideSeenKey(profileId, subKey)) === '1';
  } catch {
    return false;
  }
}

export function markGuideSeen(profileId: string | null, subKey: string): void {
  try {
    localStorage.setItem(guideSeenKey(profileId, subKey), '1');
  } catch {
    /* storage unavailable — guide simply re-shows next time; acceptable */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/kid && node --import tsx --test src/lib/guide.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/lib/guide.ts apps/kid/src/lib/guide.test.ts
git commit -m "feat(kid/guide): pure guidance engine (advanceGuide + seen persistence)"
```

---

### Task 3: Script builder + copy (`lib/guideScripts.ts`)

**Files:**
- Create: `apps/kid/src/lib/guideScripts.ts`
- Test: `apps/kid/src/lib/guideScripts.test.ts`

**Interfaces:**
- Consumes: `GuideScript`, `GuideStep` from `./guide`; `Puzzle`, `Prim`, `CodeWorld` from `./turtle`.
- Produces: `buildGuideScript(world: CodeWorld, puzzle: Puzzle, flatSolution: Prim[]): GuideScript` — one "place this prim" step per solution prim (pointing at that palette key, only it allowed), then a Run step, then a success step. The first prim step's coach is prefixed with the world's intro. Returns `[]` if `flatSolution` is empty (guide won't activate).

- [ ] **Step 1: Write the failing test**

Create `apps/kid/src/lib/guideScripts.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePuzzle, type Prim } from './turtle';
import { buildGuideScript } from './guideScripts';

describe('buildGuideScript', () => {
  it('maze: one step per arrow, then run, then success', () => {
    const puzzle = parsePuzzle('maze', { grid: { w: 5, h: 5 }, start: [0, 4], goal: [2, 4], walls: [] });
    const flat: Prim[] = [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }];
    const script = buildGuideScript('maze', puzzle, flat);
    assert.equal(script.length, 4); // 2 arrows + run + success
    assert.deepEqual(script.map((s) => s.advanceOn), ['block-placed', 'block-placed', 'run-pressed', 'success']);
    assert.deepEqual(script[0].allow, ['palette:right']);
    assert.deepEqual(script[2].allow, ['run']);
    assert.deepEqual(script[3].allow, []);
    assert.equal(script[0].target, 'palette:right');
    assert.equal(script[2].target, 'run');
  });

  it('actions: includes pick and drop steps', () => {
    const puzzle = parsePuzzle('actions', { grid: { w: 3, h: 1 }, start: [0, 0], items: [[1, 0]], targets: [[2, 0]], walls: [] });
    const flat: Prim[] = [{ op: 'move', dir: 'right' }, { op: 'pick' }, { op: 'move', dir: 'right' }, { op: 'drop' }];
    const script = buildGuideScript('actions', puzzle, flat);
    assert.deepEqual(script.map((s) => s.advanceOn),
      ['block-placed', 'pick-placed', 'block-placed', 'drop-placed', 'run-pressed', 'success']);
    assert.deepEqual(script[1].allow, ['palette:pick']);
    assert.deepEqual(script[3].allow, ['palette:drop']);
  });

  it('returns empty when there is no solution', () => {
    const puzzle = parsePuzzle('maze', { grid: { w: 3, h: 3 }, start: [0, 0], goal: [0, 0], walls: [] });
    assert.deepEqual(buildGuideScript('maze', puzzle, []), []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/kid && node --import tsx --test src/lib/guideScripts.test.ts`
Expected: FAIL — cannot find module `./guideScripts`.

- [ ] **Step 3: Implement the builder + copy**

Create `apps/kid/src/lib/guideScripts.ts`:

```ts
/**
 * Per-sub-mode guided-onboarding scripts for the Code module. A script is
 * generated from the puzzle's flat reference solution: one gated "place this
 * prim" step per prim (pointing the 👇 at exactly that palette button), then a
 * Run step, then a success celebration. Copy is bilingual, emoji-forward (no
 * audio; some kids pre-read). See the design spec for the teaching intent.
 */
import type { GuideScript, GuideStep } from './guide';
import type { Puzzle, Prim, CodeWorld, MoveDir } from './turtle';

const ARROW_GLYPH: Record<MoveDir, string> = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };

const INTRO: Record<CodeWorld, { fr: string; en: string }> = {
  maze: { fr: '⭐ Amène l’abeille à l’étoile.', en: '⭐ Get the bee to the star.' },
  draw: { fr: '✏️ Trace le dessin — l’abeille laisse une trace.', en: '✏️ Trace the drawing — the bee leaves a trail.' },
  actions: { fr: '🎯 Amène l’objet sur la cible.', en: '🎯 Bring the object to the target.' },
};

const PLACE_ARROW = (dir: MoveDir): { fr: string; en: string } => ({
  fr: `Pose cette flèche ${ARROW_GLYPH[dir]} 👇`,
  en: `Place this arrow ${ARROW_GLYPH[dir]} 👇`,
});
const ADD_PICK = { fr: 'Ajoute ✋ Ramasse 👇', en: 'Add ✋ Pick 👇' };
const ADD_DROP = { fr: 'Ajoute 📥 Pose 👇', en: 'Add 📥 Drop 👇' };
const PRESS_RUN = { fr: 'Maintenant appuie sur ▶ 👇', en: 'Now press ▶ 👇' };
const WIN: Record<CodeWorld, { fr: string; en: string }> = {
  maze: { fr: 'Bravo ! Tu as programmé l’abeille 🎉', en: 'Great! You programmed the bee 🎉' },
  draw: { fr: 'Bravo ! L’abeille a dessiné 🎨', en: 'Great! The bee drew it 🎨' },
  actions: { fr: 'Bravo ! L’abeille a livré l’objet 🎉', en: 'Great! The bee delivered it 🎉' },
};

export function buildGuideScript(world: CodeWorld, _puzzle: Puzzle, flatSolution: Prim[]): GuideScript {
  if (flatSolution.length === 0) return [];
  const steps: GuideStep[] = flatSolution.map((p) => {
    if (p.op === 'move') {
      return { coach: PLACE_ARROW(p.dir), target: `palette:${p.dir}`, advanceOn: 'block-placed', allow: [`palette:${p.dir}`] };
    }
    if (p.op === 'pick') {
      return { coach: ADD_PICK, target: 'palette:pick', advanceOn: 'pick-placed', allow: ['palette:pick'] };
    }
    return { coach: ADD_DROP, target: 'palette:drop', advanceOn: 'drop-placed', allow: ['palette:drop'] };
  });
  // Prefix the first action with the world intro so there's no separate tap-step.
  const first = steps[0]!;
  first.coach = { fr: `${INTRO[world].fr} ${first.coach.fr}`, en: `${INTRO[world].en} ${first.coach.en}` };
  steps.push({ coach: PRESS_RUN, target: 'run', advanceOn: 'run-pressed', allow: ['run'] });
  steps.push({ coach: WIN[world], advanceOn: 'success', allow: [] });
  return steps;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/kid && node --import tsx --test src/lib/guideScripts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full test script + typecheck**

Run: `cd apps/kid && pnpm test && pnpm typecheck`
Expected: all tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/kid/src/lib/guideScripts.ts apps/kid/src/lib/guideScripts.test.ts
git commit -m "feat(kid/guide): per-sub-mode Code guide script builder + copy"
```

---

### Task 4: `useGuide` React hook

**Files:**
- Create: `apps/kid/src/lib/useGuide.ts`

**Interfaces:**
- Consumes: `GuideScript`, `GuideStep`, `GuideActionKind`, `GuideState`, `initGuideState`, `advanceGuide` from `./guide`.
- Produces: `useGuide(script: GuideScript, enabled: boolean, onComplete: () => void): { active: boolean; step: GuideStep | null; stepIndex: number; report: (a: GuideActionKind) => void; skip: () => void; restart: () => void }`.

- [ ] **Step 1: Implement the hook**

Create `apps/kid/src/lib/useGuide.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import {
  advanceGuide,
  initGuideState,
  type GuideActionKind,
  type GuideScript,
  type GuideState,
  type GuideStep,
} from './guide';

/**
 * React wrapper around the pure guide engine. `enabled` is the caller's decision
 * (first-exercise && !seen, OR a help-replay toggle). The hook resets whenever a
 * new `script` is passed (a new puzzle). `report` feeds kid actions to the engine;
 * `onComplete` fires once when the last step matches OR the kid skips.
 */
export function useGuide(
  script: GuideScript,
  enabled: boolean,
  onComplete: () => void,
): {
  active: boolean;
  step: GuideStep | null;
  stepIndex: number;
  report: (a: GuideActionKind) => void;
  skip: () => void;
  restart: () => void;
} {
  const [state, setState] = useState<GuideState>(initGuideState);

  // Fresh puzzle (new script identity) → start over.
  useEffect(() => { setState(initGuideState()); }, [script]);

  const active = enabled && !state.done && script.length > 0;
  const step = active ? (script[state.stepIndex] ?? null) : null;

  const report = useCallback(
    (a: GuideActionKind) => {
      setState((prev) => {
        if (!enabled || prev.done || script.length === 0) return prev;
        const { state: next, completed } = advanceGuide(prev, script, a);
        if (completed) onComplete();
        return next;
      });
    },
    [enabled, script, onComplete],
  );

  const skip = useCallback(() => {
    setState((prev) => {
      if (prev.done) return prev;
      onComplete();
      return { ...prev, done: true };
    });
  }, [onComplete]);

  const restart = useCallback(() => { setState(initGuideState()); }, []);

  return { active, step, stepIndex: state.stepIndex, report, skip, restart };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/kid && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/lib/useGuide.ts
git commit -m "feat(kid/guide): useGuide hook wrapping the guide engine"
```

---

### Task 5: `GuidePointer` overlay + bounce animation

**Files:**
- Create: `apps/kid/src/components/GuidePointer.tsx`
- Modify: `apps/kid/src/index.css` (add `@keyframes guide-bounce`)

**Interfaces:**
- Consumes: a `RefObject<Map<string, HTMLElement | null>>` anchor registry and the current `targetKey`.
- Produces: `GuidePointer({ anchorsRef, targetKey }: { anchorsRef: React.RefObject<Map<string, HTMLElement | null>>; targetKey: string | undefined })` — a fixed-position, non-interactive 👇 that hovers just above the target element and re-measures on layout changes. Renders nothing when there is no target/element.

- [ ] **Step 1: Add the keyframes to `apps/kid/src/index.css`**

Append:

```css
@keyframes guide-bounce {
  0%, 100% { transform: translate(-50%, -100%); }
  50% { transform: translate(-50%, calc(-100% - 8px)); }
}
```

- [ ] **Step 2: Implement the component**

Create `apps/kid/src/components/GuidePointer.tsx`:

```tsx
import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * A bouncing 👇 anchored just above the current guide target. Reads the target
 * element from the session's anchor registry (a ref Map) and re-measures on
 * resize / scroll / periodic layout shifts. Purely visual — never intercepts taps.
 */
export function GuidePointer({
  anchorsRef,
  targetKey,
}: {
  anchorsRef: RefObject<Map<string, HTMLElement | null>>;
  targetKey: string | undefined;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!targetKey) { setRect(null); return; }
    const measure = () => {
      const el = anchorsRef.current?.get(targetKey) ?? null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const id = window.setInterval(measure, 300); // catch program-strip growth etc.
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.clearInterval(id);
    };
  }, [targetKey, anchorsRef]);

  if (!rect) return null;
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: rect.top,
        zIndex: 60,
        fontSize: 34,
        pointerEvents: 'none',
        animation: 'guide-bounce 0.9s ease-in-out infinite',
        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
      }}
    >
      👇
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/kid && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/kid/src/components/GuidePointer.tsx apps/kid/src/index.css
git commit -m "feat(kid/guide): GuidePointer bouncing target overlay"
```

---

### Task 6: i18n keys for guide controls

**Files:**
- Modify: `apps/kid/src/i18n.ts` (add `code.guideSkip`, `code.guideReplay`, `code.guideReplayAria` under both `fr` and `en`)

**Interfaces:**
- Consumes: existing i18n resource structure (the `code.*` namespace already holds `run`/`clear`/`skip`/`nice`/`tryAgain`).
- Produces: translation keys `code.guideSkip`, `code.guideReplay`, `code.guideReplayAria`.

- [ ] **Step 1: Add the keys**

In `apps/kid/src/i18n.ts`, locate the `fr` `code` block and add:

```ts
        guideSkip: 'Je sais, passer',
        guideReplay: '？',
        guideReplayAria: 'Revoir le guide',
```

In the `en` `code` block add:

```ts
        guideSkip: 'I know, skip',
        guideReplay: '？',
        guideReplayAria: 'Replay the guide',
```

(If the `code` blocks are flat dotted keys rather than nested objects, add `'code.guideSkip'` etc. in the same style as the surrounding `code.run` / `code.skip` keys — match the file's existing shape.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/kid && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/i18n.ts
git commit -m "feat(kid/guide): i18n keys for guide skip/replay controls"
```

---

### Task 7: Wire the guide into `CodeTurtleSession`

**Files:**
- Modify: `apps/kid/src/screens/CodeTurtleSession.tsx`

**Interfaces:**
- Consumes: `flattenProgram`, `Op` from `../lib/turtle`; `buildGuideScript` from `../lib/guideScripts`; `useGuide` from `../lib/useGuide`; `guideSeen`, `markGuideSeen` from `../lib/guide`; `GuidePointer` from `../components/GuidePointer`.
- Produces: no new exports — the guide is internal to the session.

- [ ] **Step 1: Add imports**

At the top of `CodeTurtleSession.tsx`, extend the `turtle` import to include `flattenProgram` and `Op`, and add the new module imports:

```tsx
import {
  parsePuzzle,
  runProgram,
  flattenProgram,
  HEADING_DEG,
  type CodeWorld,
  type Prim,
  type Op,
  type Frame,
  type Heading,
} from '../lib/turtle';
import { buildGuideScript } from '../lib/guideScripts';
import { useGuide } from '../lib/useGuide';
import { guideSeen, markGuideSeen } from '../lib/guide';
import { GuidePointer } from '../components/GuidePointer';
```

- [ ] **Step 2: Add anchor registry + guide state (after the existing refs, ~line 128)**

Add below `const attemptsRef = useRef(0);`:

```tsx
  const anchors = useRef<Map<string, HTMLElement | null>>(new Map());
  const setAnchor = (key: string) => (el: HTMLElement | null) => { anchors.current.set(key, el); };
  const [forceGuide, setForceGuide] = useState(false);
  const profileId = profile?.id ?? null;
  const subKey = `code:${world}`;
```

- [ ] **Step 3: Build the guide script + activate it (after `const run = useMemo(...)`, ~line 135)**

```tsx
  const guideScript = useMemo(() => {
    if (!puzzle || !q) return [];
    const answer = Array.isArray(q.answer) ? (q.answer as Op[]) : [];
    return buildGuideScript(world, puzzle, flattenProgram(puzzle, answer));
  }, [q?.id, world, puzzle]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFirstExercise = level === 1 && lesson === 1 && qIdx === 0;
  const guideEnabled =
    (forceGuide || (isFirstExercise && !guideSeen(profileId, subKey))) && guideScript.length > 0;
  const guide = useGuide(guideScript, guideEnabled, () => {
    markGuideSeen(profileId, subKey);
    setForceGuide(false);
  });
```

- [ ] **Step 4: Report actions from the existing handlers**

In `addBlock`, after `setProgram((p) => [...p, makePrim(k)]);`, add the report:

```tsx
  function addBlock(k: PrimKey) {
    if (editLocked) return;
    if (result === 'fail') setResult(null);
    setProgram((p) => [...p, makePrim(k)]);
    setFrame(0);
    if (guide.active) guide.report(k === 'pick' ? 'pick-placed' : k === 'drop' ? 'drop-placed' : 'block-placed');
  }
```

In `startRun`, add right after the guard line `if (!q || !puzzle || !run || program.length === 0 || running) return;`:

```tsx
    if (guide.active) guide.report('run-pressed');
```

In `startRun`'s success branch, inside `if (ok) {` add `guide.report('success')` as the first line:

```tsx
        if (ok) {
          if (guide.active) guide.report('success');
          const newScore = score + 1;
```

- [ ] **Step 5: Gate the controls while guided**

Add a helper near `editLocked` (~line 225):

```tsx
  const gated = (anchorKey: string) => guide.active && !(guide.step?.allow.includes(anchorKey) ?? false);
```

Update the **palette buttons** (`paletteFor(...).map`) — add the anchor ref and fold gating into `disabled`:

```tsx
              <button
                key={k}
                ref={setAnchor(`palette:${k}`)}
                onClick={() => addBlock(k)}
                disabled={editLocked || gated(`palette:${k}`)}
```

Update the **Run button**:

```tsx
            <button ref={setAnchor('run')} className="btn" onClick={() => void startRun()} disabled={editLocked || program.length === 0 || gated('run')}>
              {t('code.run')}
            </button>
```

Update the **Clear** and **lesson Skip** buttons to be disabled during the guide (the guide has its own skip):

```tsx
            <button className="btn ghost" onClick={clearProgram} disabled={editLocked || program.length === 0 || guide.active}>
              {t('code.clear')}
            </button>
            <button className="btn ghost" onClick={skip} disabled={running || guide.active}>
              {t('code.skip')}
            </button>
```

Update the **program-strip remove buttons** so a guided kid can't delete placed prims — change their `disabled={editLocked}` to `disabled={editLocked || guide.active}`.

- [ ] **Step 6: Override the coach text while guided, and render pointer + skip/replay controls**

Replace the `coach` computation (~line 291) so the guide's line wins when active:

```tsx
  const coach =
    guide.active && guide.step
      ? guide.step.coach[lang]
      : result === 'ok' ? t('code.nice')
        : result === 'fail' ? (q?.hint ? `💡 ${displayHint(q.hint, lang)}` : t('code.tryAgain'))
          : WORLD_COACH[world][lang];
```

In the `session-aside` block, add the replay button (when not guided) and the skip pill (when guided), plus render the pointer near the end of the top-level return. Change the aside to:

```tsx
        <div className="session-aside">
          <Bee size={120} expression={beeExpr} wings bob />
          <div className="bee-coach-text">{coach}</div>
          {guide.active ? (
            <button className="btn ghost" onClick={guide.skip} style={{ marginTop: 8 }}>
              {t('code.guideSkip')}
            </button>
          ) : (
            <button
              className="btn ghost"
              aria-label={t('code.guideReplayAria')}
              onClick={() => { clearProgram(); guide.restart(); setForceGuide(true); }}
              style={{ marginTop: 8, minWidth: 44 }}
            >
              {t('code.guideReplay')}
            </button>
          )}
        </div>
```

Add the pointer just before the final closing `</div>` of the `session-screen` root (after `session-body`'s closing `</div>`):

```tsx
      {guide.active && <GuidePointer anchorsRef={anchors} targetKey={guide.step?.target} />}
```

Note: `clearProgram` early-returns when `editLocked`; the replay button is only shown when `!guide.active`, and if a run succeeded (`result === 'ok'`) the kid has already left the puzzle, so this is fine. If `result === 'fail'`, `clearProgram` clears the miss and program before restarting the guide.

- [ ] **Step 7: Typecheck**

Run: `cd apps/kid && pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Manual QA (dev server)**

Run: `cd apps/kid && pnpm dev`, then in the browser:
1. Fresh profile → open **Code → Maze**, land on level 1 / lesson 1. Expect: bee-coach shows the intro + "place this arrow", 👇 bounces over the correct arrow, all other palette buttons + Run disabled. Place it → pointer moves to the next arrow → … → 👇 over Run → press Run → bee animates → win line → guide ends, lesson advances normally.
2. Reopen Maze first exercise → **no guide** (seen). The "？" replay button shows; tap it → guide replays on the current puzzle.
3. Repeat the first-open flow for **Draw** and **Actions** (Actions should include ✋ pick and 📥 drop steps).
4. On a fresh guide, tap **"Je sais, passer"** → guide ends immediately, puzzle fully interactive, and it stays gone on the next open.

- [ ] **Step 9: Commit**

```bash
git add apps/kid/src/screens/CodeTurtleSession.tsx
git commit -m "feat(kid/guide): wire guided onboarding into CodeTurtleSession (maze/draw/actions)"
```

---

## Self-Review

**Spec coverage:**
- Engine (`GuideStep`/`useGuide`) → Tasks 2 + 4. ✅
- Overlay (`GuidePointer`) reusing bee-coach → Task 5 + Task 7 Step 6. ✅
- Persistence `guide-seen:{profile}:{subMode}` → Task 2 (`guideSeenKey`). ✅
- Per-sub-mode scripts for maze/draw/actions from the reference answer → Tasks 1 + 3. ✅
- Trigger (first exercise && !seen), skip, "?" replay → Task 7 Steps 3 + 6. ✅
- Gating (only target enabled) → Task 7 Step 5. ✅
- Report actions (block/pick/drop/run/success) → Task 7 Step 4. ✅
- Testing (engine + script + flatten unit tests; manual QA) → Tasks 1/2/3 tests + Task 7 Step 8. ✅
- Edge cases: skip, wrong-action-gated (impossible by construction), help replay, reload-mid-guide (state not persisted; restarts if unseen — inherent since `useGuide` state is in-memory). ✅
- v1 = Code only → no other module touched. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✅

**Type consistency:** `GuideActionKind` values (`block-placed`/`pick-placed`/`drop-placed`/`run-pressed`/`success`) match across `guide.ts`, `guideScripts.ts`, `useGuide.ts`, and the session's `report(...)` calls. `buildGuideScript(world, puzzle, flatSolution)` signature matches its call in Task 7 Step 3. Anchor keys (`palette:${k}`, `run`) match between `setAnchor(...)`, `gated(...)`, and script `target`/`allow`. `flattenProgram(puzzle, Op[])` matches its use. ✅

**Note on spec drift (intentional):** the spec listed standalone narration ("tap") steps; the plan folds the world intro into the first action step and drops the `tap` action kind, so a pre-reading 5-year-old never has to find a "next" affordance. Fewer steps, same teaching. The design doc's teaching sequence (goal → place arrows → Run → success; actions adds pick/drop) is preserved exactly.
