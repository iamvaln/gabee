/**
 * One-shot backfill: ask Claude for a `hint` on every question that lacks
 * one (the field landed after the original arithmetic/keyboard/code seeds).
 *
 * Re-runnable: `WHERE hint IS NULL` is the only filter, so already-hinted
 * rows are skipped automatically. Batches into groups of 15 to keep the
 * model's context per call modest and stay well under output-token limits.
 *
 * Run from the repo root with:
 *
 *   pnpm --filter @gabee/db exec tsx ../../apps/web/scripts/backfill-hints.ts
 *
 * Requires ANTHROPIC_API_KEY in the env (same one the admin pool uses).
 * Idempotent and resumable — Ctrl+C mid-run, re-run, it picks up where it
 * left off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { createPrismaClient } from '@gabee/db';

// Load apps/web/.env.local so the script runs from any cwd. We don't depend
// on a dotenv package — a tiny parser keeps the script free of extra deps
// (it's only invoked via `tsx`, never bundled). MUST run BEFORE the prisma
// client is instantiated (which reads DATABASE_URL).
function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '..', '.env.local');
loadDotEnv(envFile);
if (!process.env.DATABASE_URL) {
  console.error(`[backfill] DATABASE_URL still not set — tried ${envFile}`);
}

const prisma = createPrismaClient();

const MODEL = 'claude-opus-4-8';
const BATCH = 15;

function envRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const client = new Anthropic({ apiKey: envRequired('ANTHROPIC_API_KEY') });

interface QRow {
  id: string;
  module: string;
  subMode: string;
  lang: string | null;
  prompt: unknown;
  answer: unknown;
}

interface HintReply {
  id: string;
  hint: { fr: string; en: string } | string | null;
}

function systemPrompt(): string {
  return [
    'You are a bilingual (French/English) question author for Gabee, a learning app for kids age 6-10.',
    'For each input question (a prompt + answer pair), produce a SINGLE short hint that nudges the kid toward the answer WITHOUT revealing it.',
    'Rules:',
    '- Length: ≤80 characters per language.',
    '- Never restate the prompt, the answer, or any value from the prompt verbatim.',
    '- Evoke a category, a property, a step to take — concrete and encouraging.',
    '- Tone: warm, addressed to a 6-8 year old. French uses tu/te/ton.',
    '- When the question is bilingual (lang = "both"), output a {"fr","en"} pair with full parity.',
    '- When the question is language-agnostic (lang = null), output a bare string in English.',
    '- Module style:',
    '  • numbers (arithmetic) → decompose the calculation ("Pense à 10 + 5, puis ajoute").',
    '  • numbers (geometry) → point to a visible property ("Compte les côtés un par un").',
    '  • words → category or grammatical clue ("C\'est un animal qui rugit").',
    '  • keyboard → key location ("Sur la rangée du milieu, main gauche").',
    '  • code → direction of the next move ("D\'abord à droite, puis vers le haut").',
    '  • translation → root or cognate ("Même racine qu\'en français").',
    'Respond with ONLY a JSON array, no prose, no markdown fences. Each element:',
    '{"id":"<question-id>","hint":{"fr":"…","en":"…"}|"…"}',
  ].join('\n');
}

function userPrompt(batch: QRow[]): string {
  const items = batch.map((q) => ({
    id: q.id,
    module: q.module,
    sub_mode: q.subMode,
    lang: q.lang,
    prompt: q.prompt,
    answer: q.answer,
  }));
  return `Generate one hint for each of the following ${items.length} questions:\n\n${JSON.stringify(items, null, 2)}`;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(trimmed);
}

async function processBatch(batch: QRow[]): Promise<void> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4_000,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt(batch) }],
  });

  const text = message.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('');

  const parsed = parseJson(text) as HintReply[];
  if (!Array.isArray(parsed)) {
    console.error('[backfill] unexpected response shape, skipping batch');
    return;
  }

  const byId = new Map(batch.map((q) => [q.id, q]));
  let updated = 0;
  for (const row of parsed) {
    const q = byId.get(row.id);
    if (!q) continue;
    if (row.hint == null) continue;
    // Type-shape sanity: bilingual question must get a {fr,en} hint, agnostic
    // must get a bare string. Drop mismatches rather than corrupt the column.
    const ok =
      q.lang === 'both'
        ? typeof row.hint === 'object' && row.hint && 'fr' in row.hint && 'en' in row.hint
        : typeof row.hint === 'string';
    if (!ok) {
      console.warn(`[backfill] hint shape mismatch for ${row.id} (lang=${q.lang}), skipping`);
      continue;
    }
    await prisma.question.update({
      where: { id: row.id },
      data: { hint: row.hint as object | string },
    });
    updated += 1;
  }
  console.log(`[backfill] batch processed: ${updated}/${batch.length} updated`);
}

async function main() {
  // Prisma's `{ hint: null }` on a nullable JSON column would match `Prisma.DbNull`
  // but the runtime currently surfaces the row's hint as JSON-null vs DB-null
  // inconsistently — querying via raw SQL sidesteps the ambiguity. Keep the
  // narrow `select` to avoid pulling the rest of the row over the wire.
  const rows = await prisma.$queryRaw<QRow[]>`
    SELECT id, module, sub_mode AS "subMode", lang, prompt, answer
    FROM questions
    WHERE hint IS NULL AND status IN ('candidate','confirmed')
    ORDER BY module, level, lesson
  `;

  console.log(`[backfill] ${rows.length} questions need a hint`);
  if (rows.length === 0) {
    await prisma.$disconnect();
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    console.log(`[backfill] batch ${i / BATCH + 1} (${batch.length} questions, starting ${batch[0]!.id})`);
    try {
      await processBatch(batch);
    } catch (err) {
      console.error(`[backfill] batch failed:`, err);
      // Continue with the next batch — partial progress is fine, the next
      // invocation picks up whatever is still NULL.
    }
  }

  await prisma.$disconnect();
}

void main();
