import { createTestClient } from '@gabee/db/testing';

/** Shared client for test-side DB assertions (TEST_DATABASE_URL is set by playwright.config.ts). */
export const prisma = createTestClient();

export const FIXTURES = {
  parentEmail: 'tester1@staging.gabee.app', // seed-fixtures.ts
  password: 'staging-pass',
  childName: 'Ava',
} as const;

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
