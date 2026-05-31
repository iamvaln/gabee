import 'dotenv/config';
import { createPrismaClient } from '../src/client';

/**
 * Set an existing account's role (admin spec §2). Defaults to super_admin:
 *
 *   pnpm --filter @gabee/db exec tsx prisma/make-admin.ts you@example.com
 *   pnpm --filter @gabee/db exec tsx prisma/make-admin.ts you@example.com --role admin
 *   pnpm --filter @gabee/db exec tsx prisma/make-admin.ts you@example.com --revoke   (back to parent)
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes('--revoke');
  const roleArg = process.argv[process.argv.indexOf('--role') + 1];
  const role = revoke ? 'parent' : roleArg === 'admin' ? 'admin' : 'super_admin';
  if (!email) {
    console.error('Usage: tsx prisma/make-admin.ts <email> [--role admin|super_admin] [--revoke]');
    process.exit(1);
  }

  const prisma = createPrismaClient();
  try {
    const account = await prisma.parentAccount.findUnique({ where: { email } });
    if (!account) {
      console.error(`No account found for ${email}. Sign up first, then re-run.`);
      process.exit(1);
    }
    await prisma.parentAccount.update({ where: { email }, data: { role } });
    console.log(`✓ ${email} role = ${role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('make-admin failed:', err);
  process.exit(1);
});
