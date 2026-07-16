import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * GDPR erasure-completeness guard (threat-model `app-pii-exposure`).
 *
 * The right to erasure is only real if deleting a ParentAccount / ChildProfile
 * actually takes their data with it. That property lives in the Prisma schema —
 * one relation declared without `onDelete: Cascade` silently orphans a table's
 * worth of PII, and nothing else in the test suite would notice: the app keeps
 * working, the rows just quietly outlive the person.
 *
 * So this parses schema.prisma and asserts every relation pointing at
 * ParentAccount / ChildProfile either cascades, or is a KNOWN, justified
 * exception listed below. A new table gets caught the moment it's added.
 *
 * Schema-only by design: no DB, no env, so it runs in CI with the other unit
 * tests. `verify-gdpr-cascade.mts` proves the runtime behaviour against a real
 * database; this proves nobody quietly adds a non-cascading PII table.
 */

const SCHEMA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/db/prisma/schema.prisma',
);

/**
 * Relations allowed NOT to cascade. Each needs a reason — if you add one,
 * you're saying "this data may outlive the person", so say why.
 */
const ALLOWED_NON_CASCADE: Record<string, string> = {
  // Auth audit trail. Deliberately SetNull, not Cascade — and deliberately NOT
  // purged (product-owner decision 2026-07-16: suspicious behaviour may only be
  // investigated long after the fact, so a self-erasing security log is
  // worthless).
  //
  // Be clear-eyed about what that means: this is the one place where PII
  // (ip, userAgent, and `detail`, which carries { email } on a failed login)
  // deliberately OUTLIVES an account deletion, with no time bound. It is a
  // conscious security-vs-erasure trade-off, not an oversight — the privacy
  // disclosure states it, and the legal basis for retaining it is a question
  // flagged for counsel (GDPR Art. 17(3) / 17(1)(c) overriding-grounds).
  'AuthEventLog.parentId': 'SetNull; retained unbounded for security audit — see privacy draft + counsel Q',
};

function parseModels(src: string): { name: string; body: string }[] {
  const models: { name: string; body: string }[] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) models.push({ name: m[1]!, body: m[2]! });
  return models;
}

test('every relation to ParentAccount/ChildProfile cascades (or is a justified exception)', () => {
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const models = parseModels(src);
  assert.ok(models.length > 10, 'sanity: schema parsed into models');

  const offenders: string[] = [];
  for (const model of models) {
    for (const line of model.body.split('\n')) {
      // A relation field pointing at a person-owning model, e.g.
      //   parent ParentAccount @relation(fields: [parentId], references: [id], onDelete: Cascade)
      if (!/@relation\(/.test(line)) continue;
      if (!/\b(ParentAccount|ChildProfile)\b/.test(line)) continue;

      const fk = /fields:\s*\[(\w+)\]/.exec(line)?.[1];
      if (!fk) continue; // the back-relation side declares no fields — not the FK owner
      const key = `${model.name}.${fk}`;
      if (key in ALLOWED_NON_CASCADE) continue;
      if (!/onDelete:\s*Cascade/.test(line)) {
        offenders.push(`${key} — ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These relations point at a person but don't cascade, so their rows would outlive an erasure.\n` +
      `Either add \`onDelete: Cascade\`, or add the relation to ALLOWED_NON_CASCADE with a reason:\n  ` +
      offenders.join('\n  '),
  );
});

test('the schema really does contain the person-owning models (guards the guard)', () => {
  // If a rename ever made the regex above match nothing, the test would pass
  // vacuously and stop protecting anything. Assert it has real work to do.
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const relationLines = src
    .split('\n')
    .filter((l) => /@relation\(/.test(l) && /\b(ParentAccount|ChildProfile)\b/.test(l) && /fields:/.test(l));
  assert.ok(
    relationLines.length >= 10,
    `expected many parent/child relations to check, found ${relationLines.length} — did a model get renamed?`,
  );
});

test('AuthEventLog has not silently grown its set of identifying columns', () => {
  // AuthEventLog is our ONE deliberate exception: PII that is neither cascaded
  // away on erasure nor time-bounded, because a security log that erases itself
  // is useless the day you investigate something old (decision 2026-07-16).
  //
  // That exception was weighed against a known set of columns. If someone adds
  // another identifying one, the exception silently gets wider than anyone
  // agreed to — and no other test would notice. Pin the set: growing it should
  // be a deliberate act with a fresh look at the privacy disclosure.
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const body = /^model\s+AuthEventLog\s*\{([\s\S]*?)^\}/m.exec(src)?.[1] ?? '';
  assert.ok(body, 'AuthEventLog model found');

  const identifying = body
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter((f) => f && /^(ip|userAgent|detail|email|phone|userIp|clientIp)$/.test(f));

  assert.deepEqual(
    identifying.sort(),
    ['detail', 'ip', 'userAgent'],
    'AuthEventLog gained/lost an identifying column. This table deliberately keeps PII past account deletion, unbounded — so widening it is a privacy decision, not a schema tweak. Re-check the privacy disclosure + the counsel question, then update this list.',
  );
});
