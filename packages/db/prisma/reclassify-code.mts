/**
 * Re-classify seeded `code` questions to the level their reference concept
 * belongs to, and rewrite seed-data/code.json in place. Minimises churn:
 * only moves a question when its true concept differs from its level's concept.
 *
 *   pnpm --filter @gabee/db exec tsx prisma/reclassify-code.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Concept = 'sequence' | 'loops' | 'conditions' | 'combo';

type Op = { op: string; body?: unknown[]; then?: unknown[]; else?: unknown[] };

function scan(ops: unknown, acc: { repeat: boolean; iff: boolean }): void {
  if (!Array.isArray(ops)) return;
  for (const o of ops as Op[]) {
    if (!o || typeof o !== 'object') continue;
    if (o.op === 'repeat') acc.repeat = true;
    if (o.op === 'if') acc.iff = true;
    scan(o.body, acc);
    scan(o.then, acc);
    scan(o.else, acc);
  }
}

export function classify(answer: unknown): Concept {
  const acc = { repeat: false, iff: false };
  scan(answer, acc);
  if (acc.repeat && acc.iff) return 'combo';
  if (acc.repeat) return 'loops';
  if (acc.iff) return 'conditions';
  return 'sequence';
}

/** Concept → its home level; sequence keeps L1/L2, otherwise routes to L2. */
export function targetLevel(concept: Concept, currentLevel: number): number {
  switch (concept) {
    case 'loops': return 3;
    case 'conditions': return 4;
    case 'combo': return 5;
    case 'sequence': return currentLevel === 1 || currentLevel === 2 ? currentLevel : 2;
  }
}

const CONCEPT_THEME: Record<Concept, string> = {
  sequence: 'sequence', loops: 'loops', conditions: 'conditions', combo: 'combo',
};

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'seed-data', 'code.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { questions: Record<string, unknown>[] };
  const moves: Record<string, number> = {};
  for (const q of doc.questions) {
    const concept = classify(q.answer);
    const level = targetLevel(concept, q.level as number);
    if (level !== q.level || CONCEPT_THEME[concept] !== q.theme) {
      const key = `${q.sub_mode} L${q.level}->L${level} (${concept})`;
      moves[key] = (moves[key] ?? 0) + 1;
    }
    q.level = level;
    q.theme = CONCEPT_THEME[concept];
  }
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log('Re-classified code.json:');
  for (const [k, n] of Object.entries(moves).sort()) console.log(`  ${k}: ${n}`);
  if (Object.keys(moves).length === 0) console.log('  (no moves — already classified)');
  // Pool-floor report.
  const counts: Record<string, number> = {};
  for (const q of doc.questions) {
    const key = `${q.sub_mode} L${q.level}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  console.log('Pools (flag <20):');
  for (const [k, n] of Object.entries(counts).sort()) console.log(`  ${k}: ${n}${n < 20 ? '  ⚠ under floor' : ''}`);
}

// Run only when invoked directly, not when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
