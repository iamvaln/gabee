import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { DB_URL } from './playwright.config';

const ROOT = path.resolve(__dirname, '..');

function run(cmd: string, extraEnv: Record<string, string> = {}): void {
  execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      DIRECT_URL: DB_URL,
      TEST_DATABASE_URL: DB_URL,
      ...extraEnv,
    },
  });
}

export default async function globalSetup(): Promise<void> {
  // Clean slate (resetDb re-verifies the live DB name ends in _test).
  const prisma = createTestClient();
  await resetDb(prisma);
  await prisma.$disconnect();

  // Content: sub-modes, curriculum, question pools (all status=candidate)...
  run('pnpm --filter @gabee/db run db:seed');
  // ...then confirm+publish so /api/bundles serves them (bundles filter status=confirmed).
  run('pnpm --filter @gabee/db exec tsx prisma/publish.mts');
  // Login fixtures: tester1/tester2 parents (password "staging-pass") + children Ava/Noah/Mia.
  run('pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts', { STAGING_FIXTURES: '1' });
}
