import 'dotenv/config';
import { createPrismaClient } from '../src/client';

/**
 * Confirm + publish the seeded pool so the kid app serves it.
 *
 * Flow (matches the admin pipeline): seed inserts questions as `candidate`; this
 * promotes every candidate to `confirmed`, then mints a fresh ContentBundleVersion
 * per module (the snapshot /api/bundles serves). Run AFTER `db:seed`.
 *
 *   pnpm --filter @gabee/db exec tsx prisma/publish.mts
 */
const MODULES = ['numbers', 'words', 'keyboard', 'code', 'translation'] as const;

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const promoted = await prisma.question.updateMany({
      where: { status: 'candidate' },
      data: { status: 'confirmed' },
    });
    console.log(`✓ Confirmed ${promoted.count} candidate questions.`);

    for (const module of MODULES) {
      const confirmed = await prisma.question.findMany({
        where: { module, status: 'confirmed' },
        select: { id: true },
      });
      const ids = confirmed.map((q) => q.id).sort();
      const latest = await prisma.contentBundleVersion.findFirst({
        where: { module },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      await prisma.contentBundleVersion.create({
        data: { module, version, publishedAt: new Date(), questionCount: ids.length, questionIds: ids },
      });
      console.log(`  ${module.padEnd(12)} v${version}  (${ids.length} questions)`);
    }
    console.log('✓ Published all modules.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Publish failed:', err);
  process.exit(1);
});
