/**
 * Author real loop-requiring puzzles for the Loops (level 3) pool and REPLACE
 * the degenerate ones (L3 questions whose loop doesn't compress, i.e. no
 * maxBlocks after loop-budgets.mts). Every generated puzzle is:
 *   - solvable (verified by an embedded solver mirroring publish.mts),
 *   - loop-requiring (flat length > block count → gets a maxBlocks budget),
 *   - editor-constructible in Slice 1 (nesting depth ≤ 1, no `if`, sequential loops).
 *
 *   pnpm --filter @gabee/db exec tsx prisma/author-loops.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { blockCount, flatLen, loopBudget } from './loop-budgets.mjs';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Cell = [number, number];
export type Op =
  | { op: 'move'; dir: Dir }
  | { op: 'pick' }
  | { op: 'drop' }
  | { op: 'repeat'; n: number; body: Op[] };
export type World = 'maze' | 'draw' | 'actions';

const DELTA: Record<Dir, Cell> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// ─── Embedded verifier (mirrors publish.mts solves) ──────────────────────────
type XY = { x: number; y: number };
const xy = (a: Cell): XY => ({ x: a[0], y: a[1] });
const eq = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
function segKey(a: XY, b: XY): string {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
  return `${p.x},${p.y}-${q.x},${q.y}`;
}
function targetSegs(t: { vertices?: Cell[]; paths?: Cell[][] } | undefined): Set<string> {
  const set = new Set<string>();
  const paths: XY[][] = t?.paths ? t.paths.map((p) => p.map(xy)) : t?.vertices ? [t.vertices.map(xy)] : [];
  for (const verts of paths) {
    for (let i = 0; i < verts.length - 1; i++) {
      let c = verts[i]!; const end = verts[i + 1]!;
      const dx = Math.sign(end.x - c.x), dy = Math.sign(end.y - c.y);
      while (!eq(c, end)) { const n = { x: c.x + dx, y: c.y + dy }; set.add(segKey(c, n)); c = n; }
    }
  }
  return set;
}
type Config = {
  grid: { w: number; h: number }; start: Cell; goal?: Cell;
  walls?: Cell[]; items?: Cell[]; targets?: Cell[];
  target?: { vertices?: Cell[]; paths?: Cell[][] };
};
export function solves(world: World, c: Config, program: Op[]): boolean {
  const w = c.grid.w, h = c.grid.h;
  let pos = xy(c.start);
  let carrying: number | null = null, wasted = 0;
  const items: XY[] = (c.items ?? []).map(xy);
  const walls: XY[] = (c.walls ?? []).map(xy);
  const inGrid = (p: XY) => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h;
  const blocked = (p: XY) => !inGrid(p) || walls.some((q) => eq(q, p));
  const drawn: string[] = [];
  const exec = (ops: Op[]): void => {
    for (const op of ops) {
      if (op.op === 'move') {
        const d = DELTA[op.dir]; const n = { x: pos.x + d[0], y: pos.y + d[1] };
        if (blocked(n)) wasted++;
        else { if (world === 'draw') drawn.push(segKey(pos, n)); pos = n; if (carrying !== null) items[carrying] = { ...pos }; }
      } else if (op.op === 'pick') {
        const i = items.findIndex((it, j) => j !== carrying && eq(it, pos));
        if (carrying !== null || i < 0) wasted++; else carrying = i;
      } else if (op.op === 'drop') { if (carrying === null) wasted++; else carrying = null; }
      else if (op.op === 'repeat') { for (let i = 0; i < op.n; i++) exec(op.body); }
    }
  };
  exec(program);
  if (world === 'maze') return wasted === 0 && !!c.goal && eq(pos, xy(c.goal));
  if (world === 'draw') {
    const t = targetSegs(c.target); const uniq = new Set(drawn);
    return wasted === 0 && drawn.length === t.size && uniq.size === drawn.length && [...uniq].every((s) => t.has(s));
  }
  const targets: XY[] = (c.targets ?? []).map(xy);
  return carrying === null && targets.length === items.length &&
    items.map((p) => `${p.x},${p.y}`).sort().join('|') === targets.map((p) => `${p.x},${p.y}`).sort().join('|');
}

// ─── Path helper: walk (dir,count) segments from [0,0], return offset points ──
function walk(segments: [Dir, number][]): { start: Cell; points: Cell[] } {
  let x = 0, y = 0;
  const pts: Cell[] = [[0, 0]];
  for (const [dir, n] of segments) {
    const [dx, dy] = DELTA[dir]; x += dx * n; y += dy * n; pts.push([x, y]);
  }
  const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
  const off = pts.map((p) => [p[0] - minX, p[1] - minY] as Cell);
  return { start: off[0]!, points: off };
}
function gridFor(points: Cell[], pad = 1): { w: number; h: number } {
  const maxX = Math.max(...points.map((p) => p[0])), maxY = Math.max(...points.map((p) => p[1]));
  return { w: maxX + pad, h: maxY + pad };
}
const loopSeg = (dir: Dir, n: number): Op => ({ op: 'repeat', n, body: [{ op: 'move', dir }] });

const BLOCKS: Record<World, string[]> = {
  maze: ['up', 'down', 'left', 'right', 'repeat'],
  draw: ['up', 'down', 'left', 'right', 'repeat'],
  actions: ['up', 'down', 'left', 'right', 'repeat', 'pick', 'drop'],
};

/** Build a question object, verifying solvability + loop-requirement. Throws on a bad puzzle. */
export function finalize(world: World, idx: number, answer: Op[], core: Partial<Config> & { grid: { w: number; h: number }; start: Cell }): Record<string, unknown> {
  const budget = loopBudget(answer);
  if (budget === null) throw new Error(`${world} #${idx}: loop does not compress (flat ${flatLen(answer)} <= blocks ${blockCount(answer)})`);
  const config: Config & { concept: string; blocks: string[]; maxBlocks: number } = {
    ...core, concept: 'loops', blocks: BLOCKS[world], maxBlocks: budget,
  };
  if (!solves(world, config, answer)) throw new Error(`${world} #${idx}: reference answer does not solve its puzzle`);
  const prompt = world === 'maze'
    ? { fr: "Amène le robot à l'étoile.", en: 'Get the robot to the star.' }
    : world === 'draw'
      ? { fr: 'Reproduis le dessin.', en: 'Copy the drawing.' }
      : { fr: "Apporte l'objet à la cible.", en: 'Bring the object to the target.' };
  return {
    id: `code-${world}-loops-gen-${String(idx).padStart(3, '0')}`,
    curriculum_id: '00000000-0000-4000-8000-0000000000c0',
    module: 'code', sub_mode: world, level: 3, lesson: 1, theme: 'loops', type: 'code-grid',
    objective_ref: '3', prompt, answer, distractors: [],
    hint: { fr: 'Utilise une boucle pour répéter.', en: 'Use a loop to repeat.' },
    lang: 'both', difficulty: 2, age_min: 7, age_max: 9,
    concept_tags: ['loops', world], config,
    created_by: 'ai', ratings: [], avg_rating: null, status: 'candidate',
  };
}

/** Deterministically enumerate loop-requiring puzzles for a world. */
export function generate(world: World): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let idx = 0;
  const dirs: Dir[] = ['right', 'down', 'left', 'up'];

  if (world === 'maze') {
    // Straight corridors (single loop) in each direction, lengths 3..7.
    for (const dir of dirs) for (let L = 3; L <= 7; L++) {
      const { start, points } = walk([[dir, L]]);
      out.push(finalize('maze', idx++, [loopSeg(dir, L)], { grid: gridFor(points), start, goal: points[1]! }));
    }
    // L-shapes (two loops): right a then down b, a,b in 3..5.
    for (let a = 3; a <= 5; a++) for (let b = 3; b <= 5; b++) {
      const { start, points } = walk([['right', a], ['down', b]]);
      out.push(finalize('maze', idx++, [loopSeg('right', a), loopSeg('down', b)], { grid: gridFor(points), start, goal: points[2]! }));
    }
  } else if (world === 'draw') {
    // Straight lines, lengths 3..7 each direction.
    for (const dir of dirs) for (let L = 3; L <= 7; L++) {
      const { start, points } = walk([[dir, L]]);
      out.push(finalize('draw', idx++, [loopSeg(dir, L)], { grid: gridFor(points), start, target: { vertices: points } }));
    }
    // L-shape polylines (two loops), a,b in 3..5.
    for (let a = 3; a <= 5; a++) for (let b = 3; b <= 5; b++) {
      const { start, points } = walk([['right', a], ['down', b]]);
      out.push(finalize('draw', idx++, [loopSeg('right', a), loopSeg('down', b)], { grid: gridFor(points), start, target: { vertices: points } }));
    }
  } else {
    // Carry an item along a corridor: pick at start, loop to target, drop.
    for (const dir of dirs) for (let L = 3; L <= 7; L++) {
      const { start, points } = walk([[dir, L]]);
      const answer: Op[] = [{ op: 'pick' }, loopSeg(dir, L), { op: 'drop' }];
      out.push(finalize('actions', idx++, answer, { grid: gridFor(points), start, items: [start], targets: [points[1]!] }));
    }
    // Two-loop: loop to the item, pick, loop to the target, drop.
    for (let a = 3; a <= 5; a++) for (let b = 3; b <= 5; b++) {
      const { start, points } = walk([['right', a], ['right', b]]); // straight line, item at a, target at a+b
      const answer: Op[] = [loopSeg('right', a), { op: 'pick' }, loopSeg('right', b), { op: 'drop' }];
      out.push(finalize('actions', idx++, answer, { grid: gridFor(points), start, items: [points[1]!], targets: [points[2]!] }));
    }
  }
  return out;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'seed-data', 'code.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { questions: Record<string, unknown>[] };

  // Drop degenerate L3 loop questions (no maxBlocks after loop-budgets.mts).
  const before = doc.questions.length;
  const removed: Record<string, number> = {};
  doc.questions = doc.questions.filter((q) => {
    const degenerate = q.level === 3 && !(q.config && (q.config as Record<string, unknown>).maxBlocks !== undefined);
    if (degenerate) removed[q.sub_mode as string] = (removed[q.sub_mode as string] ?? 0) + 1;
    return !degenerate;
  });

  // Append generated enforcing puzzles.
  const added: Record<string, number> = {};
  for (const world of ['maze', 'draw', 'actions'] as World[]) {
    const gen = generate(world);
    doc.questions.push(...gen);
    added[world] = gen.length;
  }

  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log(`Removed ${Object.values(removed).reduce((a, b) => a + b, 0)} degenerate L3 questions:`);
  for (const [k, n] of Object.entries(removed).sort()) console.log(`  ${k}: -${n}`);
  console.log(`Added ${Object.values(added).reduce((a, b) => a + b, 0)} generated loop questions:`);
  for (const [k, n] of Object.entries(added).sort()) console.log(`  ${k}: +${n}`);
  // Final L3 pool report.
  const pools: Record<string, number> = {};
  for (const q of doc.questions) if (q.level === 3) pools[q.sub_mode as string] = (pools[q.sub_mode as string] ?? 0) + 1;
  console.log(`code.json: ${before} → ${doc.questions.length} questions. L3 pools:`);
  for (const [k, n] of Object.entries(pools).sort()) console.log(`  ${k} L3: ${n}${n < 20 ? '  ⚠ under floor' : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
