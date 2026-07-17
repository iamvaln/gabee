/* eslint-disable @typescript-eslint/no-explicit-any */
// Tooling script: unstructured board `config`/`Op` blobs at this boundary.
/**
 * Author draw L2 "pen sequences": shapes made of TWO separate strokes, so the
 * child must lift the pen (move without drawing) between them. Self-verified by an
 * embedded draw solver mirroring turtle.ts (a move records a segment only while the
 * pen is down); `needsPen` rejects any shape that a pen-always-down program solves.
 *
 *   pnpm --filter @gabee/db exec tsx prisma/author-draw-pen.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Op = { op: string; dir?: string; state?: 'up' | 'down' };
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

/** Embedded draw solver: mirrors turtle.ts (pen down → a move draws a segment). */
export function solveDraw(c: any, program: Op[]): boolean {
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
    }
  };
  exec(program);
  const target = targetSegs(c.target); const uniq = new Set(drawn);
  return wasted === 0 && drawn.length === target.size && uniq.size === drawn.length && [...uniq].every((s) => target.has(s));
}

/** The pen is required iff the same moves with the pen never lifted fail. */
export function needsPen(c: any, program: Op[]): boolean {
  const noPen = program.filter((o) => o.op !== 'pen'); // pen never lifted → draws everything
  return !solveDraw(c, noPen);
}

const move = (dir: Dir): Op => ({ op: 'move', dir });
const runMoves = (dir: Dir, n: number): Op[] => Array.from({ length: n }, () => move(dir));
const penUp: Op = { op: 'pen', state: 'up' };
const penDown: Op = { op: 'pen', state: 'down' };
const BLOCKS = ['up', 'down', 'left', 'right', 'pen_up', 'pen_down'];

function fit(cells: XY[]): { off: XY; w: number; h: number } {
  const xs = cells.map((p) => p.x), ys = cells.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { off: { x: -minX, y: -minY }, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Two parallel strokes of length L, `gap` rows apart, along axis M with the pen
 *  lifted while travelling between them (perpendicular D). */
function twoStrokes(idx: number, M: Dir, D: Dir, L: number, gap: number): Record<string, unknown> | null {
  const S = { x: 0, y: 0 };
  const s1end = add(S, DELTA[M], L);
  const s2start = add(S, DELTA[D], gap);
  const s2end = add(s2start, DELTA[M], L);
  const cells = [S, s1end, s2start, s2end];
  const { off, w, h } = fit(cells);
  const s = (p: XY) => arr(add(p, off));
  const answer: Op[] = [
    ...runMoves(M, L),                 // stroke 1 (pen down by default)
    penUp,
    ...runMoves(D, gap),               // travel to stroke 2 (no draw)
    ...runMoves(OPP[M], L),            // back to stroke-2 start x (no draw)
    penDown,
    ...runMoves(M, L),                 // stroke 2
  ];
  const config: any = {
    grid: { w, h }, start: s(S), walls: [], concept: 'sequence', blocks: BLOCKS,
    target: { paths: [[s(S), s(s1end)], [s(s2start), s(s2end)]] },
  };
  if (!solveDraw(config, answer) || !needsPen(config, answer)) return null;
  return mk(idx, answer, config);
}

const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function mk(idx: number, answer: Op[], config: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `code-draw-pen-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: 'draw', level: 2, lesson: 1, theme: 'sequence', type: 'code-grid',
    objective_ref: '2', prompt: { fr: 'Trace les deux traits — lève le crayon entre les deux !', en: 'Draw both strokes — lift the pen between them!' },
    answer, distractors: [], hint: { fr: 'Lève le crayon pour te déplacer sans tracer.', en: 'Lift the pen to move without drawing.' },
    lang: 'both', difficulty: 2, age_min: 6, age_max: 8, concept_tags: ['pen', 'draw'],
    config, created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

export function generate(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  // horizontal strokes stacked vertically, and vertical strokes side by side.
  for (const [M, D] of [['right', 'down'], ['down', 'right']] as [Dir, Dir][]) {
    for (let L = 2; L <= 5; L++) {
      for (const gap of [2, 3]) {
        const q = twoStrokes(idx, M, D, L, gap);
        if (q) { out.push(q); idx++; }
      }
    }
  }
  // a few extra with the perpendicular gap direction for variety
  for (const [M, D] of [['right', 'up'], ['down', 'left']] as [Dir, Dir][]) {
    for (let L = 2; L <= 5; L++) {
      const q = twoStrokes(idx, M, D, L, 2);
      if (q) { out.push(q); idx++; }
    }
  }
  return out;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'seed-data', 'code.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { questions: Record<string, unknown>[] };
  const before = doc.questions.filter((q) => q.level === 2 && q.sub_mode === 'draw').length;
  doc.questions = doc.questions.filter((q) => !(q.level === 2 && q.sub_mode === 'draw'));
  const gen = generate();
  doc.questions.push(...gen);
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log(`draw L2: removed ${before} old, added ${gen.length} pen-sequence puzzles.`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
