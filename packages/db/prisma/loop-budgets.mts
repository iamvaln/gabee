/**
 * Give the seeded Loops (level 3) questions a block budget so a loop is required
 * (a flat solution won't fit). Sets `config.maxBlocks` = the reference answer's
 * block count, but ONLY where a loop actually compresses (flat length exceeds it);
 * degenerate loops that don't compress are left budget-free.
 *
 *   pnpm --filter @gabee/db exec tsx prisma/loop-budgets.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

type Op = { op: string; n?: number; body?: Op[] };

/** Container + body, matching the kid editor's blockCount (lib/program.ts). */
export function blockCount(ops: unknown): number {
  if (!Array.isArray(ops)) return 0;
  let n = 0;
  for (const o of ops as Op[]) {
    if (!o || typeof o !== 'object') continue;
    n += 1;
    if (o.op === 'repeat') n += blockCount(o.body);
  }
  return n;
}

/** Number of primitive steps after expanding every repeat by its count. */
export function flatLen(ops: unknown): number {
  if (!Array.isArray(ops)) return 0;
  let n = 0;
  for (const o of ops as Op[]) {
    if (!o || typeof o !== 'object') continue;
    if (o.op === 'repeat') n += (o.n ?? 0) * flatLen(o.body);
    else n += 1;
  }
  return n;
}

/** Budget that forces a loop, or null if a loop wouldn't help. */
export function loopBudget(answer: unknown): number | null {
  const blocks = blockCount(answer);
  const flat = flatLen(answer);
  return flat > blocks ? blocks : null;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'seed-data', 'code.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as {
    questions: { level: number; sub_mode: string; answer: unknown; config?: Record<string, unknown> }[];
  };
  let applied = 0;
  const skipped: Record<string, number> = {};
  for (const q of doc.questions) {
    if (q.level !== 3) continue;
    const budget = loopBudget(q.answer);
    if (budget === null) {
      skipped[q.sub_mode] = (skipped[q.sub_mode] ?? 0) + 1;
      continue;
    }
    q.config = { ...(q.config ?? {}), maxBlocks: budget };
    applied += 1;
  }
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log(`Applied maxBlocks to ${applied} Loops (L3) questions.`);
  const skips = Object.entries(skipped).sort();
  if (skips.length) for (const [k, n] of skips) console.log(`  skipped (loop doesn't compress) ${k}: ${n}`);
  else console.log('  (no L3 questions skipped)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
