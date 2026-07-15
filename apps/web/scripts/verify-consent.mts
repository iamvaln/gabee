/**
 * Standalone DB-integration check for provable T&C consent (ConsentRecord).
 * Lives under scripts/ (NOT src/) so the `pnpm test` runner — which only
 * globs `src/**\/*.test.ts` — never picks it up. Not part of CI.
 *
 * Run: pnpm --filter @gabee/web exec tsx scripts/verify-consent.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load packages/db/.env BEFORE importing the db module (it validates
// DATABASE_URL at import time). apps/web has no .env of its own in dev; the
// local Postgres connection string lives in packages/db/.env.
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
loadDotEnv(path.join(here, '..', '..', '..', 'packages', 'db', '.env'));

const { prisma } = await import('../src/lib/server/db');
const { hasCurrentTermsConsent, recordTermsConsent } = await import(
  '../src/lib/server/services/consent'
);
const { CURRENT_TERMS_VERSION } = await import('../src/lib/terms');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const testTag = `verify-consent-${Date.now()}`;
  const email = `${testTag}@example.invalid`;

  const parent = await prisma.parentAccount.create({
    data: { email },
    select: { id: true },
  });
  const parentId = parent.id;
  let parentDeleted = false;

  try {
    // ── Step 1: a fresh account has no consent for the current version ────
    const before = await hasCurrentTermsConsent(parentId);
    assert(before === false, `Expected no current-terms consent before recording any, got ${before}`);
    console.log('Fresh account OK: hasCurrentTermsConsent() is false with no ConsentRecord.');

    // ── Step 2: recording consent flips it to true ─────────────────────────
    await recordTermsConsent(parentId);
    const afterFirst = await hasCurrentTermsConsent(parentId);
    assert(afterFirst === true, 'Expected current-terms consent to be true after recordTermsConsent()');
    console.log('recordTermsConsent() OK: hasCurrentTermsConsent() is now true.');

    // ── Step 3: history is append-only — recording again (e.g. a later
    // version bump forces re-consent) adds a NEW row rather than overwriting
    // the first one. We simulate a version bump by inserting a row for a
    // different version directly, then re-recording for CURRENT_TERMS_VERSION,
    // and assert both rows are still present (nothing was ever deleted or
    // updated in place).
    await prisma.consentRecord.create({
      data: { parentId, type: 'terms', version: `${CURRENT_TERMS_VERSION}-simulated-bump` },
    });
    await recordTermsConsent(parentId);
    const allRecords = await prisma.consentRecord.findMany({
      where: { parentId, type: 'terms' },
      orderBy: { acceptedAt: 'asc' },
    });
    assert(
      allRecords.length === 3,
      `Expected 3 ConsentRecord rows (initial + simulated-bump + re-accept), got ${allRecords.length}`,
    );
    const versions = allRecords.map((r) => r.version);
    assert(
      versions.filter((v) => v === CURRENT_TERMS_VERSION).length === 2,
      `Expected 2 rows recorded for CURRENT_TERMS_VERSION (initial + re-accept), got versions=${JSON.stringify(versions)}`,
    );
    console.log(
      'Append-only history OK: 3 ConsentRecord rows survive across a simulated version bump + re-accept — none overwritten.',
    );

    // ── Step 4: GDPR erasure — deleting the parent cascades away consents ──
    await prisma.parentAccount.delete({ where: { id: parentId } });
    parentDeleted = true;
    const afterDelete = await prisma.consentRecord.count({ where: { parentId } });
    assert(
      afterDelete === 0,
      `Cascade failed: expected 0 ConsentRecord rows after parent delete, got ${afterDelete}`,
    );
    console.log('Cascade OK: deleting ParentAccount removed its ConsentRecord rows.');

    console.log('PASS');
  } finally {
    if (!parentDeleted) {
      await prisma.consentRecord.deleteMany({ where: { parentId } });
      await prisma.parentAccount.deleteMany({ where: { id: parentId } });
    }
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
