/* eslint-disable @typescript-eslint/no-explicit-any */
// Tooling script: unstructured board `config`/`Op` blobs at this boundary (same
// as the other author-*.mts); `any` is the natural param type.
/**
 * Author L6 "debugging" puzzles: the child is given a BROKEN program
 * (`config.given_program`) and fixes it. Bugs are fixable with the existing
 * editor controls (append-only) — a wrong LOOP COUNT (fix via ×n +/-) or a
 * wrong IF CONDITION (fix via the direction selector). Single board.
 *
 *   pnpm --filter @gabee/db exec tsx prisma/author-debug.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type World = 'maze' | 'actions';
export type Dir = 'up' | 'down' | 'left' | 'right';
export type Op = { op: string; dir?: string; n?: number; body?: Op[]; cond?: string; then?: Op[]; else?: Op[] };
type XY = { x: number; y: number };

const DELTA: Record<Dir, XY> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const eq = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const add = (p: XY, d: XY, k = 1): XY => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const arr = (p: XY): [number, number] => [p.x, p.y];
const kstr = (p: XY) => `${p.x},${p.y}`;

export function solveBoard(world: World, c: any, program: Op[]): boolean {
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
      else if (op.op === 'repeat') { for (let i = 0; i < (op.n ?? 0); i++) exec(op.body ?? []); }
      else if (op.op === 'if') {
        const m = String(op.cond).split('_')[1] as Dir; const d = DELTA[m] ?? { x: 0, y: 0 };
        exec(blocked({ x: pos.x + d.x, y: pos.y + d.y }) ? (op.then ?? []) : (op.else ?? []));
      }
    }
  };
  exec(program);
  if (world === 'maze') return wasted === 0 && eq(pos, { x: c.goal[0], y: c.goal[1] });
  const targets: XY[] = (c.targets ?? []).map((a: number[]) => ({ x: a[0], y: a[1] }));
  return carrying === null && targets.length === items.length &&
    items.map(kstr).sort().join('|') === targets.map(kstr).sort().join('|');
}

const move = (dir: Dir): Op => ({ op: 'move', dir });
const BLOCKS: Record<World, string[]> = {
  maze: ['up', 'down', 'left', 'right', 'repeat', 'if'],
  actions: ['up', 'down', 'left', 'right', 'repeat', 'if', 'pick', 'drop'],
};
function fit(cells: XY[]): { off: XY; w: number; h: number } {
  const xs = cells.map((p) => p.x), ys = cells.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { off: { x: -minX, y: -minY }, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ─── count-bug: a corridor with the wrong repeat count ───────────────────────
function countBugMaze(idx: number, M: Dir, N: number, W: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const goal = add(S, DELTA[M], N);
  const reach = add(S, DELTA[M], Math.max(N, W)); // hold the buggy overshoot in-grid
  const { off, w, h } = fit([S, goal, reach]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [{ op: 'repeat', n: N, body: [move(M)] }];
  const given: Op[] = [{ op: 'repeat', n: W, body: [move(M)] }];
  const config: any = { grid: { w, h }, start: s(S), goal: s(goal), walls: [], concept: 'debug', blocks: BLOCKS.maze, given_program: given };
  return gate('maze', idx, answer, config);
}
function countBugActions(idx: number, M: Dir, N: number, W: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const target = add(S, DELTA[M], N);
  const reach = add(S, DELTA[M], Math.max(N, W));
  const { off, w, h } = fit([S, target, reach]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [{ op: 'pick' }, { op: 'repeat', n: N, body: [move(M)] }, { op: 'drop' }];
  const given: Op[] = [{ op: 'pick' }, { op: 'repeat', n: W, body: [move(M)] }, { op: 'drop' }];
  const config: any = { grid: { w, h }, start: s(S), items: [s(S)], targets: [s(target)], walls: [], concept: 'debug', blocks: BLOCKS.actions, given_program: given };
  return gate('actions', idx, answer, config);
}

// ─── cond-bug (maze): a 1-step decision with the wrong sensor ────────────────
function condBugMaze(idx: number, M: Dir, D: Dir): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const wall = add(S, DELTA[M]);   // wall_M is TRUE → then should fire
  const goal = add(S, DELTA[D]);   // then delivers here
  const { off, w, h } = fit([S, wall, goal]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [{ op: 'if', cond: `wall_${M}`, then: [move(D)], else: [move(M)] }];
  // Buggy sensor: `wall_D` is FALSE here ([S+D] is the open goal) → else → wall → fail.
  const given: Op[] = [{ op: 'if', cond: `wall_${D}`, then: [move(D)], else: [move(M)] }];
  const config: any = { grid: { w, h }, start: s(S), goal: s(goal), walls: [s(wall)], concept: 'debug', blocks: BLOCKS.maze, given_program: given };
  return gate('maze', idx, answer, config);
}

function gate(world: World, idx: number, answer: Op[], config: any): Record<string, unknown> | null {
  if (!solveBoard(world, config, answer)) return null;       // answer must solve
  if (solveBoard(world, config, config.given_program)) return null; // given must FAIL
  return mk(world, idx, answer, config);
}

function mk(world: World, idx: number, answer: Op[], config: Record<string, unknown>): Record<string, unknown> {
  const prompt = world === 'maze'
    ? { fr: 'Le programme rate ! Corrige-le.', en: 'The program fails! Fix it.' }
    : { fr: 'La livraison rate ! Corrige le programme.', en: 'The delivery fails! Fix the program.' };
  return {
    id: `code-${world}-debug-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: world, level: 6, lesson: 1, theme: 'debug', type: 'code-grid',
    objective_ref: '6', prompt, answer, distractors: [],
    hint: { fr: 'Regarde le nombre de répétitions ou la condition.', en: 'Check the repeat count or the condition.' },
    lang: 'both', difficulty: 4, age_min: 8, age_max: 9,
    concept_tags: ['debug', world], config, created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

const M_DIRS: Dir[] = ['right', 'down', 'left', 'up'];
const PERP: Record<Dir, Dir> = { right: 'down', left: 'down', down: 'right', up: 'right' };

export function generate(world: World): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  // count bugs: 4 dirs × N∈{3,4,5} × two wrong counts (N-1, N+1 within 2..5)
  for (const M of M_DIRS) {
    for (let N = 3; N <= 5; N++) {
      for (const W of [N - 1, N + 1]) {
        if (W < 2 || W > 5) continue;
        const q = world === 'maze' ? countBugMaze(idx, M, N, W) : countBugActions(idx, M, N, W);
        if (q) { out.push(q); idx++; }
      }
    }
  }
  // cond bugs (maze only): one per orientation
  if (world === 'maze') {
    for (const M of M_DIRS) {
      const q = condBugMaze(idx, M, PERP[M]);
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
    const drop = q.level === 6 && (q.sub_mode === 'maze' || q.sub_mode === 'actions');
    if (drop) removed[q.sub_mode as string] = (removed[q.sub_mode as string] ?? 0) + 1;
    return !drop;
  });
  const added: Record<string, number> = {};
  for (const world of ['maze', 'actions'] as World[]) { const g = generate(world); doc.questions.push(...g); added[world] = g.length; }
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log('Removed L6:', removed, 'Added debug L6:', added);
  const pools: Record<string, number> = {};
  for (const q of doc.questions) if (q.level === 6) pools[`${q.sub_mode}`] = (pools[`${q.sub_mode}`] ?? 0) + 1;
  console.log('L6 pools:', pools);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
