/**
 * Test-only helpers: a Prisma client bound to the test database, a truncation
 * reset, and data factories. Imported as `@gabee/db/testing` by integration
 * and e2e suites. NEVER import this from app runtime code.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client';

export function createTestClient(
  connectionString: string = process.env.TEST_DATABASE_URL ??
    'postgresql://localhost:5432/gabee_test',
): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** Truncate every public table except _prisma_migrations (schema survives, data goes). */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = rows[0]?.name ?? '(unknown)';
  if (!name.endsWith('_test')) {
    throw new Error(
      `resetDb refused to truncate database "${name}": its name does not end with "_test". ` +
        'Point TEST_DATABASE_URL at a *_test database before running integration tests.',
    );
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  // Login/confirm routes fire `void logAuthEvent(...)` un-awaited on the
  // production prisma singleton (a separate pool from this test client). If a
  // test ends while that insert is still in flight, it can interleave with
  // this TRUNCATE and hit a lock-order inversion — Postgres resolves that by
  // killing one session with 40P01 "deadlock detected". That write is
  // fire-and-forget by design (not a bug we can fix here), so we absorb the
  // rare collision with a small bounded retry instead of flaking the suite.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isDeadlock = /deadlock detected|40P01/i.test(message);
      if (!isDeadlock || attempt === maxAttempts) throw err;
    }
  }
}

// Monotonic per-process suffix so factory rows never collide on unique columns.
let seq = 0;
function uniq(): string {
  seq += 1;
  return `${process.pid}-${seq}`;
}

export async function createParent(
  prisma: PrismaClient,
  overrides: Partial<Prisma.ParentAccountUncheckedCreateInput> = {},
) {
  return prisma.parentAccount.create({
    data: { email: `parent-${uniq()}@test.gabee.local`, ...overrides },
  });
}

export async function createChild(
  prisma: PrismaClient,
  overrides: Partial<Prisma.ChildProfileUncheckedCreateInput> = {},
) {
  const parentId = overrides.parentId ?? (await createParent(prisma)).id;
  return prisma.childProfile.create({
    data: { name: `Kid ${uniq()}`, language: 'fr', ...overrides, parentId },
  });
}

export async function createCurriculum(
  prisma: PrismaClient,
  overrides: Partial<Prisma.CurriculumUncheckedCreateInput> = {},
) {
  return prisma.curriculum.create({
    data: { name: `Test curriculum ${uniq()}`, ...overrides },
  });
}

export async function createQuestion(
  prisma: PrismaClient,
  overrides: Partial<Prisma.QuestionUncheckedCreateInput> = {},
) {
  const curriculumId = overrides.curriculumId ?? (await createCurriculum(prisma)).id;
  return prisma.question.create({
    data: {
      id: `q-test-${uniq()}`,
      module: 'numbers',
      level: 1,
      lesson: 1,
      theme: 'test',
      type: 'mcq-number',
      prompt: { text: '2 + 2 ?' },
      answer: 4,
      distractors: [3, 5],
      difficulty: 1,
      createdBy: 'factory',
      ...overrides,
      curriculumId,
    },
  });
}

export async function createDevice(
  prisma: PrismaClient,
  overrides: Partial<Prisma.DeviceUncheckedCreateInput> = {},
) {
  const parentId = overrides.parentId ?? (await createParent(prisma)).id;
  return prisma.device.create({
    data: { deviceId: `dev-${uniq()}`, uaFull: 'factory-test-agent', ...overrides, parentId },
  });
}
