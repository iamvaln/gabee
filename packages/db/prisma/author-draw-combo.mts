/* eslint-disable @typescript-eslint/no-explicit-any */
// Tooling script: unstructured board `config`/`Op` blobs at this boundary (same
// as publish.mts / author-combo.mts); `any` is the natural param type.
/**
 * Author draw L5 "combine" puzzles: one program must use BOTH a loop AND a
 * conditional pen-lift. Shape mirrors author-combo.mts (loop-then-fork):
 *   [ repeat P [move M],                       // draw the lead-in run (pen down)
 *     if wall_D { pen up, move M, pen down }    // wall beside → leave a gap
 *              else { move M },                 // no wall → draw straight through
 *     move M × T ]                              // draw the trailing run
 *   - loop forced by a block budget (inlining the P moves exceeds config.maxBlocks),
 *   - pen-condition forced by multi-board (board A has the wall → gap; board B
 *     doesn't → solid line; a branch-free program fails one of them).
 * Self-verified by an embedded draw solver mirroring turtle.ts (pen down → a move
 * draws a segment; `if wall_<dir>` resolved against the live wall/edge state).
 *
 *   pnpm --filter @gabee/db exec tsx prisma/author-draw-combo.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Op = { op: string; dir?: string; state?: 'up' | 'down'; n?: number; body?: Op[]; cond?: string; then?: Op[]; else?: Op[] };
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

/** Embedded draw solver over one board: mirrors turtle.ts (pen down → a move draws
 *  a segment; repeat + `if wall_<dir>` resolved against the live wall/edge state). */
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
      else if (op.op === 'repeat') { for (let i = 0; i < (op.n ?? 0); i++) exec(op.body ?? []); }
      else if (op.op === 'if') {
        const m = String(op.cond).split('_')[1] as Dir; const d = DELTA[m] ?? { x: 0, y: 0 };
        exec(blocked({ x: pos.x + d.x, y: pos.y + d.y }) ? (op.then ?? []) : (op.else ?? []));
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

// ─── Forcing checks (mirror author-combo.mts) ────────────────────────────────
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
/** then-only AND else-only each fail a board → the pen-condition is required. */
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
const loop = (dir: Dir, n: number): Op => ({ op: 'repeat', n, body: [move(dir)] });
const penUp: Op = { op: 'pen', state: 'up' };
const penDown: Op = { op: 'pen', state: 'down' };
const BLOCKS = ['up', 'down', 'left', 'right', 'pen_up', 'pen_down', 'repeat', 'if'];

const PERP: Record<Dir, Dir> = { up: 'left', down: 'right', left: 'up', right: 'down' };
const SIDE2: Record<Dir, Dir> = { up: 'right', down: 'left', left: 'down', right: 'up' };

function fit(cells: XY[]): { off: XY; w: number; h: number } {
  const xs = cells.map((p) => p.x), ys = cells.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { off: { x: -minX, y: -minY }, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** A line along M: a looped run of P segments, then one condition-gated segment
 *  (gap on board A, drawn on board B), then a trailing run of T segments. */
function comboDraw(idx: number, M: Dir, D: Dir, P: number, T: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const C = add(S, DELTA[M], P);            // decision cell (start of the gated segment)
  const afterGap = add(S, DELTA[M], P + 1); // where the pen comes back down
  const end = add(S, DELTA[M], P + 1 + T);  // far end of the full line
  const sensor = add(C, DELTA[D]);          // cell the `if` checks (wall on board A)
  const line = Array.from({ length: P + 1 + T + 1 }, (_, k) => add(S, DELTA[M], k));
  const { off, w, h } = fit([...line, sensor]);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [
    loop(M, P),                             // draw the lead-in run (pen down)
    { op: 'if', cond: `wall_${D}`,
      then: [penUp, move(M), penDown],      // wall beside → skip this segment (gap)
      else: [move(M)] },                    // no wall → draw straight through
    ...runMoves(M, T),                      // draw the trailing run
  ];
  const config: any = {
    grid: { w, h }, start: s(S), concept: 'combo', blocks: BLOCKS, maxBlocks: blockCount(answer),
    boards: [
      // Board A: wall beside the decision cell → lift the pen → a gap.
      { walls: [s(sensor)], target: { paths: [[s(S), s(C)], [s(afterGap), s(end)]] } },
      // Board B: no wall → the pen stays down → one solid line.
      { walls: [], target: { paths: [[s(S), s(end)]] } },
    ],
  };
  if (!solves(config, answer)) return null;
  if (!isForcing(config, answer)) return null;
  if (!loopForcing(answer, config.maxBlocks)) return null;
  return mk(idx, answer, config);
}

function mk(idx: number, answer: Op[], config: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `code-draw-combo-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: 'draw', level: 5, lesson: 1, theme: 'combo', type: 'code-grid',
    objective_ref: '5', prompt: { fr: 'Une boucle ET le crayon — un seul programme pour les deux dessins !', en: 'A loop AND the pen — one program for both drawings!' },
    answer, distractors: [], hint: { fr: 'Répète pour tracer, puis « si mur » lève le crayon.', en: 'Loop to draw, then "if wall" lift the pen.' },
    lang: 'both', difficulty: 4, age_min: 7, age_max: 9, concept_tags: ['combo', 'loops', 'conditions', 'pen', 'draw'],
    config, created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

export function generate(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  for (const M of ['right', 'down'] as Dir[]) {
    for (const D of [PERP[M], SIDE2[M]]) {
      for (let P = 3; P <= 6; P++) {
        for (const T of [1, 2]) {
          const q = comboDraw(idx, M, D, P, T);
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
  const before = doc.questions.filter((q) => q.level === 5 && q.sub_mode === 'draw').length;
  doc.questions = doc.questions.filter((q) => !(q.level === 5 && q.sub_mode === 'draw'));
  const gen = generate();
  doc.questions.push(...gen);
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log(`draw L5: removed ${before} old, added ${gen.length} combine puzzles.`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
