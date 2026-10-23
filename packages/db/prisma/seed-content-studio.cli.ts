import 'dotenv/config';
import { createPrismaClient } from '../src/client';
import { seedContentStudio } from './seed-content-studio';

/**
 * Ensure the Content Studio defaults exist (settings, model catalogue and
 * routes, platform profiles, editorial line v1, agents v1). CREATE-ONLY and
 * idempotent: it never overwrites what a super-admin changed, so it is safe on
 * every deploy — the compose `migrate` service runs it right after
 * `prisma migrate deploy`. Unlike `db:seed`, it never touches question content.
 *
 *   pnpm --filter @gabee/db run db:seed:content-studio
 */
async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await seedContentStudio(prisma);
    console.log('Content Studio defaults ensured');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('seed-content-studio failed:', err);
  process.exit(1);
});
