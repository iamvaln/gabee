/**
 * Integration-test bootstrap. Import FIRST in every *.integration.test.ts —
 * it must run before `@/lib/server/db` (the prisma singleton reads
 * DATABASE_URL at import time) and before `env.ts` validation.
 */
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/gabee_test';
if (!process.env.DATABASE_URL.includes('_test')) {
  throw new Error(`Refusing integration tests against non-test DATABASE_URL`);
}
