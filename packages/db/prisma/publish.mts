/* eslint-disable @typescript-eslint/no-explicit-any */
// Tooling script: processes Prisma JsonValue blobs (Code grid configs,
// Numbers arithmetic configs) that are intrinsically unstructured at this
// boundary. `any` is the natural type for the function params below; the
// alternative is a wall of `unknown` casts that adds no real safety.
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

// ─── Compact ABSOLUTE-direction verifier (mirrors apps/kid/src/lib/turtle.ts) ──
type Cell = { x: number; y: number };
const MOVE: Record<string, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
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
  let carrying: number | null = null, wasted = 0;
  const items: Cell[] = (c.items ?? []).map(cell);
  // Absolute content stores blockers under `walls` (older content used `obstacles`).
  const walls: Cell[] = [...(c.walls ?? []), ...(c.obstacles ?? [])].map(cell);
  const inGrid = (p: Cell) => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h;
  const blocked = (p: Cell) => !inGrid(p) || walls.some((q) => eq(q, p));
  const drawn: string[] = [];
  const exec = (ops: any[]): void => {
    for (const op of ops) {
      if (op.op === 'move') {
        const d = MOVE[op.dir]!; const n = { x: pos.x + d.x, y: pos.y + d.y };
        if (blocked(n)) wasted++;
        else { if (world === 'draw') drawn.push(segKey(pos, n)); pos = n; if (carrying !== null) items[carrying] = { ...pos }; }
      } else if (op.op === 'pick') {
        const i = items.findIndex((it, j) => j !== carrying && eq(it, pos));
        if (carrying !== null || i < 0) wasted++; else carrying = i;
      } else if (op.op === 'drop') { if (carrying === null) wasted++; else carrying = null; }
      else if (op.op === 'repeat') { for (let i = 0; i < op.n; i++) exec(op.body); }
      else if (op.op === 'if') {
        const d = MOVE[String(op.cond).split('_')[1] ?? ''] ?? { x: 0, y: 0 };
        exec(blocked({ x: pos.x + d.x, y: pos.y + d.y }) ? op.then : (op.else ?? []));
      }
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

// ─── Numbers arithmetic verifier ────────────────────────────────────────────
// Recompute the expected answer from `config` where possible. Returns 'wrong'
// only when we CAN compute it and it disagrees; 'ok'/'unknown' both pass (we
// never hold a question we can't prove wrong — e.g. parity/tens/time word answers).
function numbersExpected(c: any, pFr: string, pEn: string): number | null {
  if (!c || typeof c !== 'object') return null;
  if (typeof c.a === 'number' && typeof c.b === 'number' && typeof c.op === 'string') {
    if (c.op === '+') return c.a + c.b;
    if (c.op === '-') return c.a - c.b;
    if (c.op === '×' || c.op === 'x' || c.op === '*') return c.a * c.b;
    return null;
  }
  if (typeof c.a === 'number' && typeof c.result === 'number' && c.missing === 'b') {
    return c.op === '+' ? c.result - c.a : c.a - c.result;
  }
  if (typeof c.object === 'string' && typeof c.count === 'number') return c.count;
  if (Array.isArray(c.numbers) && c.numbers.every((n: unknown) => typeof n === 'number')) {
    const fr = pFr.toLowerCase(), en = pEn.toLowerCase();
    if (fr.includes('grand') || en.includes('largest') || en.includes('biggest')) return Math.max(...c.numbers);
    if (fr.includes('petit') || en.includes('smallest')) return Math.min(...c.numbers);
    return null;
  }
  if (Array.isArray(c.sequence) && typeof c.blank === 'number' && typeof c.step === 'number') {
    const prev = c.sequence[c.blank - 1];
    if (typeof prev === 'number') return prev + c.step;
    const next = c.sequence[c.blank + 1];
    if (typeof next === 'number') return next - c.step;
    return null;
  }
  return null;
}
function numbersWrong(c: unknown, answer: unknown, prompt: unknown): boolean {
  const p = (prompt ?? {}) as { fr?: string; en?: string };
  const exp = numbersExpected(c, p.fr ?? '', p.en ?? '');
  if (exp == null) return false; // not checkable → don't hold
  return !(typeof answer === 'number' && answer === exp);
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

    // Numbers: confirm only the arithmetically-correct ones (recompute from config).
    const numRows = await prisma.question.findMany({
      where: { module: 'numbers' },
      select: { id: true, subMode: true, level: true, config: true, answer: true, prompt: true },
    });
    const numOk: string[] = [];
    const numDropped: Record<string, number> = {};
    for (const r of numRows) {
      if (numbersWrong(r.config as unknown, r.answer as unknown, r.prompt as unknown)) {
        numDropped[`${r.subMode} L${r.level}`] = (numDropped[`${r.subMode} L${r.level}`] ?? 0) + 1;
      } else numOk.push(r.id);
    }
    await prisma.question.updateMany({ where: { id: { in: numOk } }, data: { status: 'confirmed' } });
    console.log(`✓ Numbers: confirmed ${numOk.length}/${numRows.length} (arithmetic verified).`);
    for (const [k, n] of Object.entries(numDropped).sort()) console.log(`  ⚠ held (wrong answer): ${k} — ${n}`);

    // Words / keyboard / translation: confirm wholesale (semantic — prompt + admin review).
    const promoted = await prisma.question.updateMany({
      where: { status: 'candidate', module: { in: ['words', 'keyboard', 'translation'] } },
      data: { status: 'confirmed' },
    });
    console.log(`✓ Words/keyboard/translation: confirmed ${promoted.count}.`);

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
