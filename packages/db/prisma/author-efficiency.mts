/* eslint-disable @typescript-eslint/no-explicit-any */
// Tooling script: unstructured board `config`/`Op` blobs at this boundary.
/**
 * Author L7 "efficiency" puzzles. Single board, solvable with a loop (short) OR
 * flat (long). `config.optimalBlocks` = the loop solution's block count; there is
 * NO hard `maxBlocks`, so a long flat solution still WINS — but earns fewer stars.
 * Teaches "solve in the fewest blocks".
 *
 *   pnpm --filter @gabee/db exec tsx prisma/author-efficiency.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type World = 'maze' | 'actions';
export type Dir = 'up' | 'down' | 'left' | 'right';
export type Op = { op: string; dir?: string; n?: number; body?: Op[] };
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
    }
  };
  exec(program);
  if (world === 'maze') return wasted === 0 && eq(pos, { x: c.goal[0], y: c.goal[1] });
  const targets: XY[] = (c.targets ?? []).map((a: number[]) => ({ x: a[0], y: a[1] }));
  return carrying === null && targets.length === items.length &&
    items.map(kstr).sort().join('|') === targets.map(kstr).sort().join('|');
}
export function blockCount(ops: Op[]): number {
  let n = 0;
  for (const o of ops) { n += 1; if (o.op === 'repeat') n += blockCount(o.body ?? []); }
  return n;
}
export function flatLen(ops: Op[]): number {
  let n = 0;
  for (const o of ops) { if (o.op === 'repeat') n += (o.n ?? 0) * flatLen(o.body ?? []); else n += 1; }
  return n;
}

const move = (dir: Dir): Op => ({ op: 'move', dir });
const loop = (dir: Dir, n: number): Op => ({ op: 'repeat', n, body: [move(dir)] });
const BLOCKS: Record<World, string[]> = {
  maze: ['up', 'down', 'left', 'right', 'repeat'],
  actions: ['up', 'down', 'left', 'right', 'repeat', 'pick', 'drop'],
};
function fit(cells: XY[]): { off: XY; w: number; h: number } {
  const xs = cells.map((p) => p.x), ys = cells.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { off: { x: -minX, y: -minY }, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function mazeStraight(idx: number, M: Dir, N: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 }; const goal = add(S, DELTA[M], N);
  const { off, w, h } = fit([S, goal]); const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [loop(M, N)];
  const config: any = { grid: { w, h }, start: s(S), goal: s(goal), walls: [], concept: 'efficiency', blocks: BLOCKS.maze, optimalBlocks: blockCount(answer) };
  return gate('maze', idx, answer, config);
}
function mazeL(idx: number, M: Dir, D: Dir, a: number, b: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 }; const mid = add(S, DELTA[M], a); const goal = add(mid, DELTA[D], b);
  const { off, w, h } = fit([S, mid, goal]); const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [loop(M, a), loop(D, b)];
  const config: any = { grid: { w, h }, start: s(S), goal: s(goal), walls: [], concept: 'efficiency', blocks: BLOCKS.maze, optimalBlocks: blockCount(answer) };
  return gate('maze', idx, answer, config);
}
function actionsCarry(idx: number, M: Dir, N: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 }; const target = add(S, DELTA[M], N);
  const { off, w, h } = fit([S, target]); const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [{ op: 'pick' }, loop(M, N), { op: 'drop' }];
  const config: any = { grid: { w, h }, start: s(S), items: [s(S)], targets: [s(target)], walls: [], concept: 'efficiency', blocks: BLOCKS.actions, optimalBlocks: blockCount(answer) };
  return gate('actions', idx, answer, config);
}

function gate(world: World, idx: number, answer: Op[], config: any): Record<string, unknown> | null {
  if (!solveBoard(world, config, answer)) return null;
  if (flatLen(answer) <= config.optimalBlocks) return null; // must be efficiency to gain
  return mk(world, idx, answer, config);
}
function mk(world: World, idx: number, answer: Op[], config: Record<string, unknown>): Record<string, unknown> {
  const prompt = world === 'maze'
    ? { fr: 'Atteins l’étoile — au plus court !', en: 'Reach the star — in the fewest blocks!' }
    : { fr: 'Livre l’objet — au plus court !', en: 'Deliver the object — in the fewest blocks!' };
  return {
    id: `code-${world}-eff-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: world, level: 7, lesson: 1, theme: 'efficiency', type: 'code-grid',
    objective_ref: '7', prompt, answer, distractors: [],
    hint: { fr: 'Utilise une boucle pour faire court.', en: 'Use a loop to keep it short.' },
    lang: 'both', difficulty: 5, age_min: 8, age_max: 9,
    concept_tags: ['efficiency', 'loops', world], config, created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

const M_DIRS: Dir[] = ['right', 'down', 'left', 'up'];
const PERP: Record<Dir, Dir> = { right: 'down', left: 'down', down: 'right', up: 'right' };

export function generate(world: World): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  for (const M of M_DIRS) {
    for (let N = 3; N <= 7; N++) {
      const q = world === 'maze' ? mazeStraight(idx, M, N) : actionsCarry(idx, M, N);
      if (q) { out.push(q); idx++; }
    }
    if (world === 'maze') {
      for (const [a, b] of [[3, 3], [4, 2], [2, 4], [3, 4]] as [number, number][]) {
        const q = mazeL(idx, M, PERP[M], a, b);
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
    const drop = q.level === 7 && (q.sub_mode === 'maze' || q.sub_mode === 'actions');
    if (drop) removed[q.sub_mode as string] = (removed[q.sub_mode as string] ?? 0) + 1;
    return !drop;
  });
  const added: Record<string, number> = {};
  for (const world of ['maze', 'actions'] as World[]) { const g = generate(world); doc.questions.push(...g); added[world] = g.length; }
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log('Removed L7:', removed, 'Added efficiency L7:', added);
  const pools: Record<string, number> = {};
  for (const q of doc.questions) if (q.level === 7) pools[`${q.sub_mode}`] = (pools[`${q.sub_mode}`] ?? 0) + 1;
  console.log('L7 pools:', pools);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
