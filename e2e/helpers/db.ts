import { createTestClient } from '@gabee/db/testing';

/** Shared client for test-side DB assertions (TEST_DATABASE_URL is set by playwright.config.ts). */
export const prisma = createTestClient();

export const FIXTURES = {
  parentEmail: 'tester1@staging.gabee.app', // seed-fixtures.ts
  password: 'staging-pass',
  childName: 'Ava',
  adminEmail: 'tester2@staging.gabee.app', // promoted to super_admin in global-setup.ts
  adminPassword: 'staging-pass',
  adminOnlyEmail: 'tester3@staging.gabee.app', // promoted to plain `admin` (not super) in global-setup.ts
  adminOnlyPassword: 'staging-pass',
} as const;

/**
 * Manufacture a pending-publish diff for `module`: insert a fresh `confirmed`
 * question that is NOT in the module's latest bundle snapshot, so
 * `listPendingChanges` reports it as `added` and the publish page renders the
 * `Publier v(N+1)` button. Returns the new question id + the version the next
 * publish will mint (current latest + 1). Unique id per call keeps it retry-safe
 * (a Playwright retry seeds another row and mints the next version).
 */
export async function seedPendingPublish(
  module: string,
  uniqSuffix: string,
): Promise<{ questionId: string; nextVersion: number }> {
  const curriculum = await prisma.curriculum.findFirstOrThrow({ where: { isDefault: true } });
  const latest = await prisma.contentBundleVersion.findFirst({
    where: { module: module as never },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const questionId = `e2e-pending-${module}-${uniqSuffix}`;
  await prisma.question.upsert({
    where: { id: questionId },
    update: { status: 'confirmed' },
    create: {
      id: questionId,
      curriculumId: curriculum.id,
      module: module as never,
      subMode: 'counting',
      level: 1,
      lesson: 1,
      theme: 'e2e',
      type: 'mcq-number',
      prompt: '1 + 1 ?',
      answer: 2,
      distractors: [1, 3],
      difficulty: 1,
      createdBy: 'e2e',
      status: 'confirmed',
    },
  });
  return { questionId, nextVersion: (latest?.version ?? 0) + 1 };
}

/** Poll `fn` until `pred` accepts its value; throws with the last value on timeout. */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  pred: (value: T) => boolean,
  { timeoutMs = 30_000, intervalMs = 500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() < deadline);
  throw new Error(`pollUntil timed out after ${timeoutMs}ms; last value: ${JSON.stringify(last)}`);
}
