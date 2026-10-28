import 'dotenv/config';
import { createPrismaClient } from '../src/client';
import { seedContentStudio } from './seed-content-studio';

/**
 * Ensure the Content Studio defaults exist (settings, model catalogue and
 * routes, platform profiles, editorial line v1, agents v1), and publish an
 * agent's changed instruction file as a new version when its live version came
 * from the seed. Idempotent: it never overwrites what a super-admin changed
 * (an owner agent version included), so it is safe on every deploy — the
 * compose `migrate` service runs it right after `prisma migrate deploy`. Unlike `db:seed`, it never touches question content.
 *
 *   pnpm --filter @gabee/db run db:seed:content-studio
 */
async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const { agents } = await seedContentStudio(prisma);
    for (const [key, outcome] of Object.entries(agents)) {
      if (outcome === 'upgraded') console.log(`Agent ${key}: instructions file published as a new version`);
      if (outcome === 'owner_version' || outcome === 'owner_pointer') console.log(`Agent ${key}: kept the owner's version (instructions file not applied)`);
    }
    console.log('Content Studio defaults ensured');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('seed-content-studio failed:', err);
  process.exit(1);
});
