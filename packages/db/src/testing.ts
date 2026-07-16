/**
 * Test-only helpers: a Prisma client bound to the test database, a truncation
 * reset, and data factories. Imported as `@gabee/db/testing` by integration
 * and e2e suites. NEVER import this from app runtime code.
 */
import { randomUUID } from 'node:crypto';
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
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
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

/**
 * Seed `count` correct-answer events for a child — the server's evidence that this
 * many stars were legitimately earned (1 star = 1 correct `question_answered`).
 * `syncProgress` bounds the client-declared `total_stars` by this count, so any test
 * that syncs stars must first establish the evidence for them, exactly as real play
 * does (the kid app drains events before progress). Returns the number seeded.
 */
export async function seedCorrectAnswers(
  prisma: PrismaClient,
  profileId: string,
  count: number,
): Promise<number> {
  if (count <= 0) return 0;
  const now = new Date();
  await prisma.event.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      eventId: randomUUID(),
      profileId,
      name: 'question_answered',
      clientTs: now,
      payload: { name: 'question_answered', correct: true } as Prisma.InputJsonValue,
    })),
  });
  return count;
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
