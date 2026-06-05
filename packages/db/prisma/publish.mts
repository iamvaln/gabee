import 'dotenv/config';
import { createPrismaClient } from '../src/client';

/**
 * Confirm + publish the seeded pool so the kid app serves it.
 *
 * Guardrail: code-grid questions are SIMULATED first (turtle interpreter); only
 * those whose `answer` actually solves the puzzle are confirmed/published. A
 * broken/unsolvable code question stays `candidate` (never reaches the kid).
 * Non-code modules are confirmed wholesale (prompt self-check + admin review).
 *
 *   pnpm --filter @gabee/db exec tsx prisma/publish.mts
 */
const MODULES = ['numbers', 'words', 'keyboard', 'code', 'translation'] as const;

// ─── Compact turtle verifier (mirrors apps/kid/src/lib/turtle.ts) ────────────
type Heading = 'N' | 'E' | 'S' | 'W';
type Cell = { x: number; y: number };
const ORDER: Heading[] = ['N', 'E', 'S', 'W'];
const DELTA: Record<Heading, Cell> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
const turn = (h: Heading, d: 'left' | 'right') => ORDER[(ORDER.indexOf(h) + (d === 'right' ? 1 : 3)) % 4]!;
const cell = (a: any): Cell => ({ x: a[0], y: a[1] });
const eq = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
function segKey(a: Cell, b: Cell): string {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
  return `${p.x},${p.y}-${q.x},${q.y}`;
}
function targetSegs(t: any): Set<string> {
  const set = new Set<string>();
  const paths: Cell[][] = t?.paths ? t.paths.map((p: any) => p.map(cell)) : t?.vertices ? [t.vertices.map(cell)] : [];
  for (const verts of paths) {
    for (let i = 0; i < verts.length - 1; i++) {
      let c = verts[i]!; const end = verts[i + 1]!;
      const dx = Math.sign(end.x - c.x), dy = Math.sign(end.y - c.y);
      while (!eq(c, end)) { const n = { x: c.x + dx, y: c.y + dy }; set.add(segKey(c, n)); c = n; }
    }
  }
  return set;
}
function solves(world: string, config: any, program: any[]): boolean {
  const c = config ?? {};
  const w = c.grid?.w ?? 5, h = c.grid?.h ?? 5;
  let pos: Cell = c.start ? cell(c.start) : { x: 0, y: 0 };
  let heading: Heading = c.facing ?? 'E';
  let carrying: number | null = null, penDown = true, wasted = 0;
  const items: Cell[] = (c.items ?? []).map(cell);
  const walls: Cell[] = (c.walls ?? []).map(cell);
  const obstacles: Cell[] = (c.obstacles ?? []).map(cell);
  const inGrid = (p: Cell) => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h;
  const isWall = (p: Cell) => walls.some((q) => eq(q, p));
  const isObs = (p: Cell) => obstacles.some((q) => eq(q, p));
  const blocked = (p: Cell) => !inGrid(p) || isWall(p) || isObs(p);
  const ahead = (n = 1): Cell => ({ x: pos.x + DELTA[heading].x * n, y: pos.y + DELTA[heading].y * n });
  const drawn: string[] = [];
  const cond = (name: string) => {
    const n = ahead();
    if (name === 'wall_ahead') return blocked(n);
    if (name === 'cell_occupied') return isObs(n);
    if (name === 'can_pick') return items.some((it, i) => i !== carrying && eq(it, pos));
    return false;
  };
  const exec = (ops: any[]): void => {
    for (const op of ops) {
      if (op.op === 'turn') heading = turn(heading, op.dir);
      else if (op.op === 'forward') {
        const n = ahead();
        if (blocked(n)) wasted++;
        else { if (world === 'draw' && penDown) drawn.push(segKey(pos, n)); pos = n; if (carrying !== null) items[carrying] = { ...pos }; }
      } else if (op.op === 'jump') {
        const n = ahead(2);
        if (!inGrid(n) || isWall(n) || isObs(n)) wasted++;
        else { pos = n; if (carrying !== null) items[carrying] = { ...pos }; }
      } else if (op.op === 'pick') {
        const i = items.findIndex((it, j) => j !== carrying && eq(it, pos));
        if (carrying !== null || i < 0) wasted++; else carrying = i;
      } else if (op.op === 'drop') { if (carrying === null) wasted++; else carrying = null; }
      else if (op.op === 'pen') penDown = op.state === 'down';
      else if (op.op === 'repeat') { for (let i = 0; i < op.n; i++) exec(op.body); }
      else if (op.op === 'if') exec(cond(op.cond) ? op.then : (op.else ?? []));
    }
  };
  try { exec(program ?? []); } catch { return false; }
  if (world === 'maze') return wasted === 0 && !!c.goal && eq(pos, cell(c.goal));
  if (world === 'draw') {
    const t = targetSegs(c.target); const uniq = new Set(drawn);
    return wasted === 0 && drawn.length === t.size && uniq.size === drawn.length && [...uniq].every((s) => t.has(s));
  }
  const targets: Cell[] = (c.targets ?? []).map(cell);
  return carrying === null && targets.length === items.length &&
    items.map((p) => `${p.x},${p.y}`).sort().join('|') === targets.map((p) => `${p.x},${p.y}`).sort().join('|');
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    // Code: confirm only the solvable ones (simulate the reference answer).
    const codeRows = await prisma.question.findMany({
      where: { module: 'code' },
      select: { id: true, subMode: true, level: true, config: true, answer: true },
    });
    const solvable: string[] = [];
    const dropped: Record<string, number> = {};
    for (const r of codeRows) {
      if (solves(r.subMode, r.config as unknown, r.answer as unknown[])) solvable.push(r.id);
      else dropped[`${r.subMode} L${r.level}`] = (dropped[`${r.subMode} L${r.level}`] ?? 0) + 1;
    }
    await prisma.question.updateMany({ where: { id: { in: solvable } }, data: { status: 'confirmed' } });
    console.log(`✓ Code: confirmed ${solvable.length}/${codeRows.length} solvable.`);
    for (const [k, n] of Object.entries(dropped).sort()) console.log(`  ⚠ held (unsolvable answer): ${k} — ${n}`);

    // Non-code: confirm wholesale.
    const promoted = await prisma.question.updateMany({
      where: { status: 'candidate', module: { not: 'code' } },
      data: { status: 'confirmed' },
    });
    console.log(`✓ Non-code: confirmed ${promoted.count}.`);

    for (const module of MODULES) {
      const confirmed = await prisma.question.findMany({ where: { module, status: 'confirmed' }, select: { id: true } });
      const ids = confirmed.map((q) => q.id).sort();
      const latest = await prisma.contentBundleVersion.findFirst({ where: { module }, orderBy: { version: 'desc' }, select: { version: true } });
      const version = (latest?.version ?? 0) + 1;
      await prisma.contentBundleVersion.create({ data: { module, version, publishedAt: new Date(), questionCount: ids.length, questionIds: ids } });
      console.log(`  ${module.padEnd(12)} v${version}  (${ids.length} questions)`);
    }
    console.log('✓ Published all modules.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Publish failed:', err);
  process.exit(1);
});
