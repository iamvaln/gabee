import '../../../test/setup-integration'; // src/lib/server/services -> src/test (3 dirs up)
import test, { after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestClient, resetDb, createCurriculum } from '@gabee/db/testing';
import { runAdminWeeklyDigest } from './admin-weekly-digest';

// A failed weekly send must be observable AND must not stamp the marker (so the
// next daily poke retries instead of the whole week silently going dark). We
// force the failure by selecting the mailgun provider with no credentials —
// sendEmail then returns { ok: false, error: 'missing_credentials' } without a
// network call.
const prisma = createTestClient();

// getContentMatrix() (via gatherAttention) resolves the default curriculum, and
// getDefaultCurriculumId() memoizes it for the process lifetime — so seed the
// default with a fixed id, matching the admin-content integration test.
const DEFAULT_CURRICULUM_ID = randomUUID();

const savedEnv: Record<string, string | undefined> = {};
beforeEach(async () => {
  await resetDb(prisma);
  await createCurriculum(prisma, { id: DEFAULT_CURRICULUM_ID, isDefault: true });
  for (const k of ['EMAIL_PROVIDER', 'MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'RESEND_API_KEY']) {
    savedEnv[k] = process.env[k];
  }
  process.env.EMAIL_PROVIDER = 'mailgun';
  delete process.env.MAILGUN_API_KEY;
  delete process.env.MAILGUN_DOMAIN;
  delete process.env.RESEND_API_KEY;
});
after(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await prisma.$disconnect();
});

test('a failed send is logged and does NOT stamp the marker (retries next poke)', async () => {
  const errs: string[] = [];
  mock.method(console, 'error', (...args: unknown[]) => {
    errs.push(args.map(String).join(' '));
  });

  const summary = await runAdminWeeklyDigest(new Date(), { force: true });

  assert.equal(summary.sent, false);
  assert.equal(summary.skipped, 'send_failed');
  // The failure reached the server log with an identifiable tag + the reason.
  assert.ok(
    errs.some((l) => l.includes('[admin-digest]') && l.includes('missing_credentials')),
    `expected an [admin-digest] error log, got: ${JSON.stringify(errs)}`,
  );
  // Crucially: no marker written, so the next poke will try again rather than
  // treating the week as already sent.
  const state = await prisma.adminDigestState.findUnique({ where: { id: 'default' } });
  assert.equal(state, null);
});

test('a successful send stamps the marker (gates the rest of the week)', async () => {
  process.env.EMAIL_PROVIDER = 'noop'; // returns ok without a network call

  const now = new Date();
  const summary = await runAdminWeeklyDigest(now, { force: true });

  assert.equal(summary.sent, true);
  const state = await prisma.adminDigestState.findUniqueOrThrow({ where: { id: 'default' } });
  assert.ok(state.lastWeeklyAt, 'marker stamped so the next daily poke no-ops');
});
