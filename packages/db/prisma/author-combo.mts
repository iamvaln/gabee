/* eslint-disable @typescript-eslint/no-explicit-any */
// Tooling script: unstructured board `config`/`Op` blobs at this boundary (same
// as publish.mts / author-conditions.mts); `any` is the natural param type.
/**
 * Author L5 "combine" puzzles: one program must use BOTH a loop AND an if.
 *   - loop forced by a block budget (a flat corridor exceeds config.maxBlocks),
 *   - if forced by multi-board (a branch-free program fails a board).
 * Shape: a looped corridor to a decision cell, then a fork.
 *   maze:    [repeat P [M], if wall_M { detour } else { straight }]   (common goal)
 *   actions: [pick, repeat P [M], if wall_M { D } else { M }, drop]   (per-board target)
 *
 *   pnpm --filter @gabee/db exec tsx prisma/author-combo.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type World = 'maze' | 'actions';
export type Dir = 'up' | 'down' | 'left' | 'right';
export type Op = { op: string; dir?: string; n?: number; body?: Op[]; cond?: string; then?: Op[]; else?: Op[] };
type XY = { x: number; y: number };

const DELTA: Record<Dir, XY> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const eq = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const add = (p: XY, d: XY, k = 1): XY => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const arr = (p: XY): [number, number] => [p.x, p.y];
const kstr = (p: XY) => `${p.x},${p.y}`;

// ─── Embedded solver over one board (mirrors publish.mts) ────────────────────
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
function boardsOf(c: any): any[] { return c.boards.map((b: any) => ({ ...c, ...b })); }
export function solves(world: World, c: any, program: Op[]): boolean {
  return boardsOf(c).every((b) => solveBoard(world, b, program));
}

// ─── Forcing checks ──────────────────────────────────────────────────────────
export function blockCount(ops: Op[]): number {
  let n = 0;
  for (const o of ops) {
    n += 1;
    if (o.op === 'repeat') n += blockCount(o.body ?? []);
    else if (o.op === 'if') n += blockCount(o.then ?? []) + blockCount(o.else ?? []);
  }
  return n;
}
/** Block count with loops inlined (container removed, body repeated n times). */
function flatBlocks(ops: Op[]): number {
  let n = 0;
  for (const o of ops) {
    if (o.op === 'repeat') n += (o.n ?? 0) * flatBlocks(o.body ?? []);
    else if (o.op === 'if') n += 1 + flatBlocks(o.then ?? []) + flatBlocks(o.else ?? []);
    else n += 1;
  }
  return n;
}
/** The loop is required iff inlining it exceeds the budget. */
export function loopForcing(program: Op[], maxBlocks: number): boolean {
  return flatBlocks(program) > maxBlocks;
}
/** then-only AND else-only each fail a board → the branch is required. */
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
  maze: ['up', 'down', 'left', 'right', 'repeat', 'if'],
  actions: ['up', 'down', 'left', 'right', 'repeat', 'pick', 'drop', 'if'],
};
const move = (dir: Dir): Op => ({ op: 'move', dir });
const runMoves = (dir: Dir, n: number): Op[] => Array.from({ length: n }, () => move(dir));
const loop = (dir: Dir, n: number): Op => ({ op: 'repeat', n, body: [move(dir)] });

function fit(cells: XY[]): { off: XY; w: number; h: number } {
  const xs = cells.map((p) => p.x), ys = cells.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { off: { x: -minX, y: -minY }, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ─── maze combine: looped corridor (P) + common-goal fork (arm A) ────────────
function comboMaze(idx: number, M: Dir, D: Dir, P: number, A: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const C = add(S, DELTA[M], P);          // decision cell after the looped corridor
  const goal = add(C, DELTA[M], A);       // common goal
  const wallA = add(C, DELTA[M]);         // board A: straight blocked → detour
  const wallB = add(C, DELTA[D]);         // board B: detour blocked → straight
  const corridor = Array.from({ length: P }, (_, k) => add(S, DELTA[M], k + 1));
  const straight = Array.from({ length: A }, (_, k) => add(C, DELTA[M], k + 1));
  const detour = [add(C, DELTA[D]), ...Array.from({ length: A }, (_, k) => add(add(C, DELTA[D]), DELTA[M], k + 1))];
  const { off, w, h } = fit([S, C, goal, wallA, wallB, ...corridor, ...straight, ...detour]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [
    loop(M, P),
    { op: 'if', cond: `wall_${M}`, then: [move(D), ...runMoves(M, A), move(OPP[D])], else: runMoves(M, A) },
  ];
  const config = {
    grid: { w, h }, concept: 'combo', blocks: BLOCKS.maze, maxBlocks: blockCount(answer),
    boards: [
      { start: s(S), goal: s(goal), walls: [s(wallA)] },
      { start: s(S), goal: s(goal), walls: [s(wallB)] },
    ],
  };
  return gate('maze', idx, answer, config);
}

// ─── actions combine: looped carry corridor + per-board delivery fork ────────
function comboActions(idx: number, M: Dir, D: Dir, P: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const C = add(S, DELTA[M], P);
  const wallA = add(C, DELTA[M]);         // board A: deliver via then (D)
  const wallB = add(C, DELTA[D]);         // board B: deliver via else (M)
  const targetA = add(C, DELTA[D]);
  const targetB = add(C, DELTA[M]);
  const corridor = Array.from({ length: P }, (_, k) => add(S, DELTA[M], k + 1));
  const { off, w, h } = fit([S, C, wallA, wallB, targetA, targetB, ...corridor]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [
    { op: 'pick' }, loop(M, P),
    { op: 'if', cond: `wall_${M}`, then: [move(D)], else: [move(M)] },
    { op: 'drop' },
  ];
  const config = {
    grid: { w, h }, concept: 'combo', blocks: BLOCKS.actions, maxBlocks: blockCount(answer),
    boards: [
      { start: s(S), items: [s(S)], targets: [s(targetA)], walls: [s(wallA)] },
      { start: s(S), items: [s(S)], targets: [s(targetB)], walls: [s(wallB)] },
    ],
  };
  return gate('actions', idx, answer, config);
}

function gate(world: World, idx: number, answer: Op[], config: any): Record<string, unknown> | null {
  if (!solves(world, config, answer)) return null;
  if (!isForcing(world, config, answer)) return null;
  if (!loopForcing(answer, config.maxBlocks)) return null;
  return mk(world, idx, answer, config);
}

function mk(world: World, idx: number, answer: Op[], config: Record<string, unknown>): Record<string, unknown> {
  const prompt = world === 'maze'
    ? { fr: 'Une boucle ET un « si » — pour les deux labyrinthes !', en: 'A loop AND an if — for both mazes!' }
    : { fr: 'Une boucle ET un « si » pour livrer sur les deux plateaux !', en: 'A loop AND an if to deliver on both boards!' };
  return {
    id: `code-${world}-combo-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: world, level: 5, lesson: 1, theme: 'combo', type: 'code-grid',
    objective_ref: '5', prompt, answer, distractors: [],
    hint: { fr: 'Répète pour avancer, puis « si mur ».', en: 'Loop to move, then "if wall".' },
    lang: 'both', difficulty: 4, age_min: 7, age_max: 9,
    concept_tags: ['combo', 'loops', 'conditions', world], config, created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

const ORIENTS: [Dir, Dir][] = [['right', 'down'], ['right', 'up'], ['down', 'right'], ['down', 'left']];

export function generate(world: World): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  for (const [M, D] of ORIENTS) {
    for (let P = 3; P <= 7; P++) {
      const q = world === 'maze' ? comboMaze(idx, M, D, P, 2) : comboActions(idx, M, D, P);
      if (q) { out.push(q); idx++; }
    }
    if (world === 'maze') {
      for (let A = 1; A <= 3; A++) { // extra maze variety via fork-arm length
        const q = comboMaze(idx, M, D, 4, A);
        if (q) { out.push(q); idx++; }
      }
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
    const drop = q.level === 5 && (q.sub_mode === 'maze' || q.sub_mode === 'actions');
    if (drop) removed[q.sub_mode as string] = (removed[q.sub_mode as string] ?? 0) + 1;
    return !drop;
  });
  const added: Record<string, number> = {};
  for (const world of ['maze', 'actions'] as World[]) { const g = generate(world); doc.questions.push(...g); added[world] = g.length; }
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log('Removed single-board L5:', removed);
  console.log('Added combine L5:', added);
  const pools: Record<string, number> = {};
  for (const q of doc.questions) if (q.level === 5) pools[`${q.sub_mode}`] = (pools[`${q.sub_mode}`] ?? 0) + 1;
  console.log('L5 pools:', pools);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
