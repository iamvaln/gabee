/* eslint-disable @typescript-eslint/no-explicit-any */
// Tooling script: the board `config`/`Op` blobs are intrinsically unstructured
// JSON at this boundary (same as publish.mts), so `any` is the natural param
// type; the alternative is a wall of `unknown` casts that adds no real safety.
/**
 * Author forcing multi-board conditions puzzles for the L4 pool and replace the
 * old single-board L4 (maze + actions). Each puzzle:
 *   - has >= 2 boards a single if/else program must all solve,
 *   - is FORCING: collapsing the if to then-only AND to else-only each fails a
 *     board (so a branch-free program cannot pass all boards),
 *   - is editor-constructible (one if, primitive branches, no nesting/loops).
 *
 * Two designs, because the worlds' success rules differ:
 *   maze    — common goal; straight-vs-detour. Forced by wasted===0 + exact goal.
 *   actions — a DIFFERENT target per board; the branch selects the delivery, so a
 *             wrong branch lands the item on the wrong cell (wasted is tolerated).
 *
 *   pnpm --filter @gabee/db exec tsx prisma/author-conditions.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type World = 'maze' | 'actions';
export type Dir = 'up' | 'down' | 'left' | 'right';
type Op = { op: string; dir?: string; cond?: string; then?: Op[]; else?: Op[] };
type XY = { x: number; y: number };

const DELTA: Record<Dir, XY> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const eq = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const add = (p: XY, d: XY, k = 1): XY => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const key = (p: XY) => `${p.x},${p.y}`;
const arr = (p: XY): [number, number] => [p.x, p.y];

// ─── Embedded solver over a single board (mirrors publish.mts solves) ────────
function solveBoard(world: World, c: any, program: Op[]): boolean {
  const w = c.grid.w, h = c.grid.h;
  let pos: XY = { x: c.start[0], y: c.start[1] };
  let carrying: number | null = null, wasted = 0;
  const items: XY[] = (c.items ?? []).map((a: number[]) => ({ x: a[0], y: a[1] }));
  const walls: XY[] = (c.walls ?? []).map((a: number[]) => ({ x: a[0], y: a[1] }));
  const inGrid = (p: XY) => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h;
  const blocked = (p: XY) => !inGrid(p) || walls.some((q) => eq(q, p));
  const exec = (ops: Op[]): void => {
    for (const op of ops) {
      if (op.op === 'move') {
        const d = DELTA[op.dir as Dir]; const n = { x: pos.x + d.x, y: pos.y + d.y };
        if (blocked(n)) wasted++; else { pos = n; if (carrying !== null) items[carrying] = { ...pos }; }
      } else if (op.op === 'pick') {
        const i = items.findIndex((it, j) => j !== carrying && eq(it, pos));
        if (carrying !== null || i < 0) wasted++; else carrying = i;
      } else if (op.op === 'drop') { if (carrying === null) wasted++; else carrying = null; }
      else if (op.op === 'if') {
        const m = String(op.cond).split('_')[1] as Dir; const d = DELTA[m] ?? { x: 0, y: 0 };
        exec(blocked({ x: pos.x + d.x, y: pos.y + d.y }) ? op.then! : (op.else ?? []));
      }
    }
  };
  exec(program);
  if (world === 'maze') return wasted === 0 && eq(pos, { x: c.goal[0], y: c.goal[1] });
  const targets: XY[] = (c.targets ?? []).map((a: number[]) => ({ x: a[0], y: a[1] }));
  return carrying === null && targets.length === items.length &&
    items.map(key).sort().join('|') === targets.map(key).sort().join('|');
}
function boardsOf(c: any): any[] { return c.boards.map((b: any) => ({ ...c, ...b })); }
export function solves(world: World, c: any, program: Op[]): boolean {
  return boardsOf(c).every((b) => solveBoard(world, b, program));
}
/** then-only and else-only must EACH fail a board → the branch is required. */
export function isForcing(world: World, c: any, program: Op[]): boolean {
  const idx = program.findIndex((o) => o.op === 'if');
  if (idx < 0) return false;
  const iff = program[idx]!;
  const before = program.slice(0, idx), after = program.slice(idx + 1);
  const thenOnly = [...before, ...(iff.then ?? []), ...after];
  const elseOnly = [...before, ...(iff.else ?? []), ...after];
  const boards = boardsOf(c);
  return boards.some((b) => !solveBoard(world, b, thenOnly)) && boards.some((b) => !solveBoard(world, b, elseOnly));
}

const BLOCKS: Record<World, string[]> = {
  maze: ['up', 'down', 'left', 'right', 'if'],
  actions: ['up', 'down', 'left', 'right', 'if', 'pick', 'drop'],
};
const move = (dir: Dir): Op => ({ op: 'move', dir });
const runMoves = (dir: Dir, n: number): Op[] => Array.from({ length: n }, () => move(dir));

/** Shift every cell so the minimum is (0,0); returns the offset and grid size. */
function fit(cells: XY[]): { off: XY; w: number; h: number } {
  const minX = Math.min(...cells.map((p) => p.x)), minY = Math.min(...cells.map((p) => p.y));
  const maxX = Math.max(...cells.map((p) => p.x)), maxY = Math.max(...cells.map((p) => p.y));
  return { off: { x: -minX, y: -minY }, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ─── maze: common goal, straight-vs-detour ───────────────────────────────────
function forkMaze(idx: number, M: Dir, D: Dir, L: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const goal = add(S, DELTA[M], L);
  const wallA = add(S, DELTA[M]);           // blocks the straight on board A
  const wallB = add(S, DELTA[D]);           // blocks the detour on board B
  const straightCells = Array.from({ length: L }, (_, k) => add(S, DELTA[M], k + 1));
  const detourCells = [add(S, DELTA[D]), ...Array.from({ length: L }, (_, k) => add(add(S, DELTA[D]), DELTA[M], k + 1))];
  const { off, w, h } = fit([S, goal, wallA, wallB, ...straightCells, ...detourCells]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [{ op: 'if', cond: `wall_${M}`,
    then: [move(D), ...runMoves(M, L), move(OPP[D])], else: runMoves(M, L) }];
  const config = {
    grid: { w, h }, concept: 'conditions', blocks: BLOCKS.maze,
    boards: [
      { start: s(S), goal: s(goal), walls: [s(wallA)] },
      { start: s(S), goal: s(goal), walls: [s(wallB)] },
    ],
  };
  if (!solves('maze', config, answer) || !isForcing('maze', config, answer)) return null;
  return mk('maze', idx, answer, config);
}

// ─── actions: per-board target; the branch selects the delivery ──────────────
function forkActions(idx: number, M: Dir, D: Dir, pre: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const C = add(S, DELTA[M], pre);          // decision cell after a shared corridor
  const wallA = add(C, DELTA[M]);           // board A: wall ahead → then (deliver to C+D)
  const wallB = add(C, DELTA[D]);           // board B: wall to the side → else (deliver to C+M)
  const targetA = add(C, DELTA[D]);
  const targetB = add(C, DELTA[M]);
  const corridor = Array.from({ length: pre }, (_, k) => add(S, DELTA[M], k + 1));
  const { off, w, h } = fit([S, C, wallA, wallB, targetA, targetB, ...corridor]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [
    { op: 'pick' }, ...runMoves(M, pre),
    { op: 'if', cond: `wall_${M}`, then: [move(D)], else: [move(M)] },
    { op: 'drop' },
  ];
  const config = {
    grid: { w, h }, concept: 'conditions', blocks: BLOCKS.actions,
    boards: [
      { start: s(S), items: [s(S)], targets: [s(targetA)], walls: [s(wallA)] },
      { start: s(S), items: [s(S)], targets: [s(targetB)], walls: [s(wallB)] },
    ],
  };
  if (!solves('actions', config, answer) || !isForcing('actions', config, answer)) return null;
  return mk('actions', idx, answer, config);
}

function mk(world: World, idx: number, answer: Op[], config: Record<string, unknown>): Record<string, unknown> {
  const prompt = world === 'maze'
    ? { fr: 'Un seul programme pour les deux labyrinthes !', en: 'One program for both mazes!' }
    : { fr: 'Un seul programme pour livrer sur les deux plateaux !', en: 'One program to deliver on both boards!' };
  return {
    id: `code-${world}-cond-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: world, level: 4, lesson: 1, theme: 'conditions', type: 'code-grid',
    objective_ref: '4', prompt, answer, distractors: [],
    hint: { fr: 'Si mur devant → sinon.', en: 'If wall ahead → else.' }, lang: 'both', difficulty: 3, age_min: 7, age_max: 9,
    concept_tags: ['conditions', world], config, created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

const ORIENTS: [Dir, Dir][] = [['right', 'down'], ['right', 'up'], ['down', 'right'], ['down', 'left']];

export function generate(world: World): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  for (const [M, D] of ORIENTS) {
    for (let n = 2; n <= 8; n++) {
      const q = world === 'maze' ? forkMaze(idx, M, D, n) : forkActions(idx, M, D, n - 2);
      if (q) { out.push(q); idx++; }
    }
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
  console.log('Removed single-board L4:', removed);
  console.log('Added forcing L4:', added);
  const pools: Record<string, number> = {};
  for (const q of doc.questions) if (q.level === 4) pools[`${q.sub_mode}`] = (pools[`${q.sub_mode}`] ?? 0) + 1;
  console.log('L4 pools:', pools);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
