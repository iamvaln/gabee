/**
 * Shared turtle engine for the three Code worlds (Curriculum v0.1 §4):
 *   maze    — reach the star, finishing exactly on it
 *   draw    — trace the target shape exactly (no overshoot / retrace)
 *   actions — pick up items and drop them on their targets
 *
 * One movement model across all three (the doc's "virage"): forward + turn-left +
 * turn-right with a heading. Coordinates are [x,y], origin top-left, x→right,
 * y→down. The kid builds a FLAT program of primitive ops; loops/conditions are an
 * efficiency concern (measured later), so every puzzle is solvable by unrolling.
 *
 * Config shapes come straight from the seed (docs/gabee-seed-schema-v1.md §4).
 */

export type Heading = 'N' | 'E' | 'S' | 'W';
export type Cell = { x: number; y: number };
export type CodeWorld = 'maze' | 'draw' | 'actions';

/** Primitive ops the kid can place (no repeat/if — those stay in the seed `answer`). */
export type Prim =
  | { op: 'forward' }
  | { op: 'turn'; dir: 'left' | 'right' }
  | { op: 'pick' }
  | { op: 'drop' };

const ORDER: Heading[] = ['N', 'E', 'S', 'W'];
const DELTA: Record<Heading, Cell> = {
  N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 },
};
/** Heading → CSS rotation (deg) for the on-grid heading arrow (E = 0°). */
export const HEADING_DEG: Record<Heading, number> = { E: 0, S: 90, W: 180, N: 270 };

export function turn(h: Heading, dir: 'left' | 'right'): Heading {
  const i = ORDER.indexOf(h);
  return ORDER[(i + (dir === 'right' ? 1 : 3)) % 4]!;
}
function ahead(pos: Cell, h: Heading): Cell {
  const d = DELTA[h];
  return { x: pos.x + d.x, y: pos.y + d.y };
}
function eq(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}
function inGrid(c: Cell, w: number, h: number): boolean {
  return c.x >= 0 && c.x < w && c.y >= 0 && c.y < h;
}
/** Undirected unit-segment key so travel direction doesn't matter (draw). */
function segKey(a: Cell, b: Cell): string {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
  return `${p.x},${p.y}-${q.x},${q.y}`;
}

export interface Puzzle {
  world: CodeWorld;
  w: number;
  h: number;
  start: Cell;
  facing: Heading;
  blocks: string[];
  // maze
  goal?: Cell;
  walls?: Cell[];
  // draw — target as the set of unit segments to cover
  targetSegs?: Set<string>;
  targetVertices?: Cell[][]; // for rendering the ghost outline
  // actions
  items?: Cell[];
  targets?: Cell[];
  obstacles?: Cell[];
}

function vertexPathToSegs(verts: Cell[], set: Set<string>): void {
  for (let i = 0; i < verts.length - 1; i++) {
    let cur = verts[i]!;
    const end = verts[i + 1]!;
    const dx = Math.sign(end.x - cur.x);
    const dy = Math.sign(end.y - cur.y);
    while (!eq(cur, end)) {
      const nxt = { x: cur.x + dx, y: cur.y + dy };
      set.add(segKey(cur, nxt));
      cur = nxt;
    }
  }
}

const toCell = (a: unknown): Cell => {
  const [x, y] = a as [number, number];
  return { x, y };
};

/** Parse a code-grid question config into a normalized Puzzle. */
export function parsePuzzle(world: CodeWorld, config: unknown): Puzzle {
  const c = (config ?? {}) as Record<string, unknown>;
  const grid = (c.grid ?? { w: 5, h: 5 }) as { w: number; h: number };
  const base: Puzzle = {
    world,
    w: grid.w ?? 5,
    h: grid.h ?? 5,
    start: c.start ? toCell(c.start) : { x: 0, y: 0 },
    facing: (c.facing as Heading) ?? 'E',
    blocks: (c.blocks as string[]) ?? [],
  };
  if (world === 'maze') {
    base.goal = c.goal ? toCell(c.goal) : { x: 0, y: 0 };
    base.walls = ((c.walls as unknown[]) ?? []).map(toCell);
  } else if (world === 'draw') {
    const target = (c.target ?? {}) as { vertices?: unknown[]; paths?: unknown[][] };
    const paths: Cell[][] = target.paths
      ? target.paths.map((p) => (p as unknown[]).map(toCell))
      : target.vertices
        ? [(target.vertices as unknown[]).map(toCell)]
        : [];
    const segs = new Set<string>();
    for (const p of paths) vertexPathToSegs(p, segs);
    base.targetSegs = segs;
    base.targetVertices = paths;
  } else {
    base.items = ((c.items as unknown[]) ?? []).map(toCell);
    base.targets = ((c.targets as unknown[]) ?? []).map(toCell);
    base.obstacles = ((c.obstacles as unknown[]) ?? []).map(toCell);
  }
  return base;
}

export interface Frame {
  pos: Cell;
  heading: Heading;
  carrying: number | null; // index into items
  items: Cell[];
  trail: Cell[]; // visited cells (draw shows the polyline)
}

export interface RunResult {
  frames: Frame[]; // frames[0] = initial state; one per executed primitive
  success: boolean;
}

/**
 * Execute a flat primitive program against a puzzle, recording one frame per op
 * for animation, and computing per-world success.
 *
 * Exactness (agreed rules):
 *  - maze: finishes ON the goal, no wall/edge bump
 *  - draw: every forward lays a brand-new target segment; all covered, none extra
 *  - actions: every item delivered to a target, hands empty (waste tolerated —
 *    clean loops carry a trailing repositioning move)
 */
export function runProgram(puzzle: Puzzle, program: Prim[]): RunResult {
  let pos = { ...puzzle.start };
  let heading = puzzle.facing;
  let carrying: number | null = null;
  const items = (puzzle.items ?? []).map((c) => ({ ...c }));
  const walls = puzzle.walls ?? [];
  const obstacles = puzzle.obstacles ?? [];
  const blocked = (c: Cell) =>
    !inGrid(c, puzzle.w, puzzle.h) ||
    walls.some((wc) => eq(wc, c)) ||
    obstacles.some((o) => eq(o, c));

  const trail: Cell[] = [{ ...pos }];
  const drawn: string[] = [];
  let wasted = 0;
  const frames: Frame[] = [
    { pos: { ...pos }, heading, carrying, items: items.map((c) => ({ ...c })), trail: [...trail] },
  ];

  for (const op of program) {
    if (op.op === 'turn') {
      heading = turn(heading, op.dir);
    } else if (op.op === 'forward') {
      const nxt = ahead(pos, heading);
      if (blocked(nxt)) {
        wasted += 1; // bumped a wall/edge → no move
      } else {
        if (puzzle.world === 'draw') drawn.push(segKey(pos, nxt));
        pos = nxt;
        trail.push({ ...pos });
        if (carrying !== null) items[carrying] = { ...pos };
      }
    } else if (op.op === 'pick') {
      const idx = items.findIndex((it, i) => i !== carrying && eq(it, pos));
      if (carrying !== null || idx < 0) wasted += 1;
      else carrying = idx;
    } else if (op.op === 'drop') {
      if (carrying === null) wasted += 1;
      else carrying = null;
    }
    frames.push({
      pos: { ...pos },
      heading,
      carrying,
      items: items.map((c) => ({ ...c })),
      trail: [...trail],
    });
  }

  let success: boolean;
  if (puzzle.world === 'maze') {
    success = wasted === 0 && !!puzzle.goal && eq(pos, puzzle.goal);
  } else if (puzzle.world === 'draw') {
    const target = puzzle.targetSegs ?? new Set<string>();
    const uniq = new Set(drawn);
    success =
      wasted === 0 &&
      drawn.length === target.size &&
      uniq.size === drawn.length &&
      [...uniq].every((s) => target.has(s));
  } else {
    const targets = puzzle.targets ?? [];
    const delivered =
      carrying === null &&
      targets.length === items.length &&
      [...items].map((c) => `${c.x},${c.y}`).sort().join('|') ===
        [...targets].map((c) => `${c.x},${c.y}`).sort().join('|');
    success = delivered;
  }
  return { frames, success };
}
