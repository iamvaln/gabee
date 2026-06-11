/**
 * Code engine for the three worlds (Curriculum v0.1 §4), ABSOLUTE-direction model:
 *   maze    — reach the star, finishing exactly on it
 *   draw    — trace the target shape exactly (pen always down)
 *   actions — pick an item and drop it on its target
 *
 * Movement is four ABSOLUTE arrows — up / down / left / right — not "forward + turn"
 * (turning was confusing for young kids; relative heading returns at higher levels).
 * Coordinates are [x,y], origin top-left, x→right, y→down.
 *
 * The kid builds a FLAT program of move/pick/drop. `runProgram` is a FULL interpreter
 * (it also executes `repeat` and `if wall_<dir>`, used by the seed reference answers
 * at the loop/condition levels) so the same code verifies those reference programs.
 * The per-puzzle palette comes from `config.blocks`.
 */

export type Heading = 'N' | 'E' | 'S' | 'W';
export type MoveDir = 'up' | 'down' | 'left' | 'right';
export type Cell = { x: number; y: number };
export type CodeWorld = 'maze' | 'draw' | 'actions';

/** Flat primitives the kid can place (palette derived from config.blocks). */
export type Prim =
  | { op: 'move'; dir: MoveDir }
  | { op: 'pick' }
  | { op: 'drop' };

/** Full op set, including the control structures the seed `answer` may use. */
export type Op =
  | Prim
  | { op: 'repeat'; n: number; body: Op[] }
  | { op: 'if'; cond: string; then: Op[]; else?: Op[] };

const MOVE_DELTA: Record<MoveDir, Cell> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
/** Last-move direction → bee facing (just for the on-grid arrow flair). */
const DIR_TO_HEADING: Record<MoveDir, Heading> = { up: 'N', down: 'S', left: 'W', right: 'E' };
/** Heading → CSS rotation (deg) for the on-grid heading arrow (E = 0°). */
export const HEADING_DEG: Record<Heading, number> = { E: 0, S: 90, W: 180, N: 270 };

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
  goal?: Cell;
  walls?: Cell[];
  targetSegs?: Set<string>;
  targetVertices?: Cell[][];
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
    facing: 'S',
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
    // Absolute actions store blockers under `walls`; older content used `obstacles`.
    base.obstacles = ((c.walls as unknown[]) ?? (c.obstacles as unknown[]) ?? []).map(toCell);
  }
  return base;
}

export interface Seg { a: Cell; b: Cell }
export interface Frame {
  pos: Cell;
  heading: Heading;
  carrying: number | null;
  items: Cell[];
  penDown: boolean;
  /** Pen-down segments drawn so far (draw world) — rendered as the trail. */
  drawn: Seg[];
}

export interface RunResult {
  frames: Frame[];
  success: boolean;
}

/**
 * Execute a program (flat move/pick/drop, or the full op set with repeat/if)
 * against a puzzle, recording one frame per executed primitive for animation,
 * and computing per-world success.
 *
 * Exactness: maze finishes ON the goal with no wall/edge bump; draw's segments
 * (pen always down) equal the target exactly (each once, none off-shape); actions
 * delivers the item onto its target with empty hands (wasted moves tolerated).
 */
export function runProgram(puzzle: Puzzle, program: Op[]): RunResult {
  let pos = { ...puzzle.start };
  let heading = puzzle.facing;
  let carrying: number | null = null;
  const penDown = true;
  const items = (puzzle.items ?? []).map((c) => ({ ...c }));
  const walls = puzzle.walls ?? [];
  const obstacles = puzzle.obstacles ?? [];
  const blocked = (c: Cell) =>
    !inGrid(c, puzzle.w, puzzle.h) || walls.some((w) => eq(w, c)) || obstacles.some((o) => eq(o, c));

  const drawn: Seg[] = [];
  const drawnKeys: string[] = [];
  let wasted = 0;
  const frames: Frame[] = [];
  const snapshot = () => frames.push({
    pos: { ...pos }, heading, carrying, items: items.map((c) => ({ ...c })), penDown, drawn: drawn.map((s) => ({ ...s })),
  });
  snapshot(); // initial

  const exec = (ops: Op[]): void => {
    for (const op of ops) {
      switch (op.op) {
        case 'move': {
          const d = MOVE_DELTA[op.dir];
          const nxt = { x: pos.x + d.x, y: pos.y + d.y };
          heading = DIR_TO_HEADING[op.dir];
          if (blocked(nxt)) { wasted += 1; }
          else {
            if (puzzle.world === 'draw') { drawn.push({ a: { ...pos }, b: { ...nxt } }); drawnKeys.push(segKey(pos, nxt)); }
            pos = nxt;
            if (carrying !== null) items[carrying] = { ...pos };
          }
          snapshot();
          break;
        }
        case 'pick': {
          const idx = items.findIndex((it, i) => i !== carrying && eq(it, pos));
          if (carrying !== null || idx < 0) wasted += 1;
          else carrying = idx;
          snapshot();
          break;
        }
        case 'drop':
          if (carrying === null) wasted += 1;
          else carrying = null;
          snapshot();
          break;
        case 'repeat':
          for (let i = 0; i < op.n; i++) exec(op.body);
          break;
        case 'if': {
          const m = op.cond.split('_')[1] as MoveDir | undefined;
          const d = m ? MOVE_DELTA[m] : { x: 0, y: 0 };
          const isBlocked = blocked({ x: pos.x + d.x, y: pos.y + d.y });
          exec(isBlocked ? op.then : (op.else ?? []));
          break;
        }
      }
    }
  };
  exec(program);

  let success: boolean;
  if (puzzle.world === 'maze') {
    success = wasted === 0 && !!puzzle.goal && eq(pos, puzzle.goal);
  } else if (puzzle.world === 'draw') {
    const target = puzzle.targetSegs ?? new Set<string>();
    const uniq = new Set(drawnKeys);
    success =
      wasted === 0 &&
      drawnKeys.length === target.size &&
      uniq.size === drawnKeys.length &&
      [...uniq].every((s) => target.has(s));
  } else {
    const targets = puzzle.targets ?? [];
    success =
      carrying === null &&
      targets.length === items.length &&
      [...items].map((c) => `${c.x},${c.y}`).sort().join('|') ===
        [...targets].map((c) => `${c.x},${c.y}`).sort().join('|');
  }
  return { frames, success };
}
