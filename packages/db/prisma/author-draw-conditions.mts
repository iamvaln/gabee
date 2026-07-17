/* eslint-disable @typescript-eslint/no-explicit-any */
// Tooling script: unstructured board `config`/`Op` blobs at this boundary
// (same as publish.mts / author-conditions.mts), so `any` is the natural param
// type; a wall of `unknown` casts here would add no real safety.
/**
 * Author draw L4 "pen conditions": forcing multi-board puzzles where a single
 * program must lift the pen BY CONDITION. The bee draws a straight line; at one
 * decision cell an `if wall_<D>` senses a wall beside the path:
 *   - wall present  → then: pen up, move, pen down  (skip that segment → a gap)
 *   - no wall        → else: move                    (draw straight through)
 *
 * Two boards share the program: board A has the wall (target = line with a gap),
 * board B has none (target = solid line). FORCING: collapsing the if to then-only
 * (always gap) fails the solid board, and to else-only (always draw) fails the
 * gapped board — so a branch-free program cannot pass both. Self-verified by an
 * embedded draw solver that mirrors turtle.ts (pen down → a move draws a segment;
 * `if wall_<dir>` resolved against the live wall/edge state).
 *
 *   pnpm --filter @gabee/db exec tsx prisma/author-draw-conditions.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Op = { op: string; dir?: string; state?: 'up' | 'down'; cond?: string; then?: Op[]; else?: Op[] };
type XY = { x: number; y: number };

const DELTA: Record<Dir, XY> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const eq = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const add = (p: XY, d: XY, k = 1): XY => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const arr = (p: XY): [number, number] => [p.x, p.y];
const segKey = (a: XY, b: XY): string => {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
  return `${p.x},${p.y}-${q.x},${q.y}`;
};

function targetSegs(target: any): Set<string> {
  const set = new Set<string>();
  const paths: XY[][] = target?.paths
    ? target.paths.map((p: number[][]) => p.map((c) => ({ x: c[0], y: c[1] })))
    : target?.vertices ? [target.vertices.map((c: number[]) => ({ x: c[0], y: c[1] }))] : [];
  for (const verts of paths) {
    for (let i = 0; i < verts.length - 1; i++) {
      let c = verts[i]!; const end = verts[i + 1]!;
      const dx = Math.sign(end.x - c.x), dy = Math.sign(end.y - c.y);
      while (!eq(c, end)) { const n = { x: c.x + dx, y: c.y + dy }; set.add(segKey(c, n)); c = n; }
    }
  }
  return set;
}

/** Embedded draw solver over a single board: mirrors turtle.ts (pen down → a move
 *  draws a segment; `if wall_<dir>` resolved against the live wall/edge state). */
function solveBoard(c: any, program: Op[]): boolean {
  const w = c.grid.w, h = c.grid.h;
  let pos: XY = { x: c.start[0], y: c.start[1] };
  let penDown = true, wasted = 0;
  const walls: XY[] = (c.walls ?? []).map((a: number[]) => ({ x: a[0], y: a[1] }));
  const inGrid = (p: XY) => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h;
  const blocked = (p: XY) => !inGrid(p) || walls.some((q) => eq(q, p));
  const drawn: string[] = [];
  const exec = (ops: Op[]): void => {
    for (const op of ops) {
      if (op.op === 'move') {
        const d = DELTA[op.dir as Dir]; const n = { x: pos.x + d.x, y: pos.y + d.y };
        if (blocked(n)) wasted++; else { if (penDown) drawn.push(segKey(pos, n)); pos = n; }
      } else if (op.op === 'pen') penDown = op.state === 'down';
      else if (op.op === 'if') {
        const m = String(op.cond).split('_')[1] as Dir; const d = DELTA[m] ?? { x: 0, y: 0 };
        exec(blocked({ x: pos.x + d.x, y: pos.y + d.y }) ? op.then! : (op.else ?? []));
      }
    }
  };
  exec(program);
  const target = targetSegs(c.target); const uniq = new Set(drawn);
  return wasted === 0 && drawn.length === target.size && uniq.size === drawn.length && [...uniq].every((s) => target.has(s));
}

function boardsOf(c: any): any[] { return c.boards.map((b: any) => ({ ...c, ...b })); }
export function solves(c: any, program: Op[]): boolean {
  return boardsOf(c).every((b) => solveBoard(b, program));
}
/** then-only and else-only must EACH fail a board → the branch is required. */
export function isForcing(c: any, program: Op[]): boolean {
  const idx = program.findIndex((o) => o.op === 'if');
  if (idx < 0) return false;
  const iff = program[idx]!;
  const before = program.slice(0, idx), after = program.slice(idx + 1);
  const thenOnly = [...before, ...(iff.then ?? []), ...after];
  const elseOnly = [...before, ...(iff.else ?? []), ...after];
  const boards = boardsOf(c);
  return boards.some((b) => !solveBoard(b, thenOnly)) && boards.some((b) => !solveBoard(b, elseOnly));
}

const move = (dir: Dir): Op => ({ op: 'move', dir });
const runMoves = (dir: Dir, n: number): Op[] => Array.from({ length: n }, () => move(dir));
const penUp: Op = { op: 'pen', state: 'up' };
const penDown: Op = { op: 'pen', state: 'down' };
const BLOCKS = ['up', 'down', 'left', 'right', 'pen_up', 'pen_down', 'if'];

const PERP: Record<Dir, Dir> = { up: 'left', down: 'right', left: 'up', right: 'down' };

function fit(cells: XY[]): { off: XY; w: number; h: number } {
  const xs = cells.map((p) => p.x), ys = cells.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { off: { x: -minX, y: -minY }, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** A line of L segments along M with the gap at segment `g`. The condition senses a
 *  wall at the decision cell offset by D (perpendicular); board A has it, board B doesn't. */
function forkDraw(idx: number, M: Dir, D: Dir, L: number, g: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const end = add(S, DELTA[M], L);                 // far end of the full line
  const C = add(S, DELTA[M], g);                   // decision cell (start of the gap segment)
  const afterGap = add(S, DELTA[M], g + 1);        // where the pen comes back down
  const sensor = add(C, DELTA[D]);                 // cell the `if` checks (wall on board A)
  const line = Array.from({ length: L + 1 }, (_, k) => add(S, DELTA[M], k));
  const { off, w, h } = fit([...line, sensor]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [
    ...runMoves(M, g),                             // draw up to the decision cell
    { op: 'if', cond: `wall_${D}`,
      then: [penUp, move(M), penDown],             // wall beside → skip this segment (gap)
      else: [move(M)] },                           // no wall → draw straight through
    ...runMoves(M, L - g - 1),                      // draw the rest
  ];
  const config = {
    grid: { w, h }, start: s(S), concept: 'conditions', blocks: BLOCKS,
    boards: [
      // Board A: wall beside the decision cell → the child must lift the pen → gap.
      { walls: [s(sensor)], target: { paths: [[s(S), s(C)], [s(afterGap), s(end)]] } },
      // Board B: no wall → the pen stays down → one solid line.
      { walls: [], target: { paths: [[s(S), s(end)]] } },
    ],
  };
  if (!solves(config, answer) || !isForcing(config, answer)) return null;
  return mk(idx, answer, config);
}

function mk(idx: number, answer: Op[], config: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `code-draw-cond-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: 'draw', level: 4, lesson: 1, theme: 'conditions', type: 'code-grid',
    objective_ref: '4', prompt: { fr: 'Un seul programme pour les deux dessins — lève le crayon si besoin !', en: 'One program for both drawings — lift the pen if needed!' },
    answer, distractors: [], hint: { fr: 'Si un mur touche la case, lève le crayon pour laisser un trou.', en: 'If a wall touches the cell, lift the pen to leave a gap.' },
    lang: 'both', difficulty: 3, age_min: 7, age_max: 9, concept_tags: ['conditions', 'pen', 'draw'],
    config, created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

export function generate(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  // Both line axes, both perpendicular sides, a range of lengths and gap positions.
  for (const M of ['right', 'down'] as Dir[]) {
    for (const D of [PERP[M], ({ up: 'right', down: 'left', left: 'down', right: 'up' } as Record<Dir, Dir>)[M]]) {
      for (let L = 3; L <= 5; L++) {
        for (let g = 1; g <= L - 2; g++) {
          const q = forkDraw(idx, M, D, L, g);
          if (q) { out.push(q); idx++; }
        }
      }
    }
  }
  return out;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'seed-data', 'code.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { questions: Record<string, unknown>[] };
  const before = doc.questions.filter((q) => q.level === 4 && q.sub_mode === 'draw').length;
  doc.questions = doc.questions.filter((q) => !(q.level === 4 && q.sub_mode === 'draw'));
  const gen = generate();
  doc.questions.push(...gen);
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log(`draw L4: removed ${before} old, added ${gen.length} pen-condition puzzles.`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
