import '../../../test/setup-integration'; // src/lib/server/services -> src/test (3 dirs up)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent } from '@gabee/db/testing';
import { hasCurrentTermsConsent, recordTermsConsent } from './consent';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';

// The provable-consent gate is the legal basis for the PII Gabee collects, so its
// invariants are worth pinning: an account with no current-version record is gated;
// acceptance clears it; a version bump re-gates; and the record is append-only so we
// can always show what a parent agreed to and when.
const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('a parent with no consent record is NOT consented (gate would trigger)', async () => {
  const parent = await createParent(prisma);
  assert.equal(await hasCurrentTermsConsent(parent.id), false);
});

test('recording consent makes the parent consented', async () => {
  const parent = await createParent(prisma);
  await recordTermsConsent(parent.id);
  assert.equal(await hasCurrentTermsConsent(parent.id), true);

  const row = await prisma.consentRecord.findFirstOrThrow({ where: { parentId: parent.id } });
  assert.equal(row.type, 'terms');
  // The server stamps its own version — the client never sends one.
  assert.equal(row.version, CURRENT_TERMS_VERSION);
});

test('a version bump re-gates a parent whose only acceptance is for an older version', async () => {
  const parent = await createParent(prisma);
  // Acceptance recorded against a PAST version (what a bump leaves behind).
  await prisma.consentRecord.create({
    data: { parentId: parent.id, type: 'terms', version: '2026-01-01-old' },
  });
  // hasCurrentTermsConsent matches only CURRENT_TERMS_VERSION, so the old row
  // doesn't count — exactly what re-gates everyone after the constant is bumped.
  assert.equal(await hasCurrentTermsConsent(parent.id), false);

  await recordTermsConsent(parent.id); // re-accept the current version
  assert.equal(await hasCurrentTermsConsent(parent.id), true);
});

test('consent is append-only — a second acceptance adds a row, never updates', async () => {
  const parent = await createParent(prisma);
  await recordTermsConsent(parent.id);
  await recordTermsConsent(parent.id);

  const rows = await prisma.consentRecord.findMany({ where: { parentId: parent.id } });
  assert.equal(rows.length, 2, 'each acceptance appends its own record (audit history)');
  assert.ok(rows.every((r) => r.version === CURRENT_TERMS_VERSION));
  // Distinct rows (distinct ids) — proof it created, not upserted-in-place.
  assert.equal(new Set(rows.map((r) => r.id)).size, 2);
});
