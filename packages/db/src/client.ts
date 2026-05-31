import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

/**
 * Create a Prisma client backed by the `pg` driver adapter (Prisma 7 — adapters are
 * the standard runtime). Defaults to `DATABASE_URL` (the pooled Supabase connection).
 */
export function createPrismaClient(
  connectionString: string | undefined = process.env.DATABASE_URL,
): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — cannot create a Prisma client.');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export { PrismaClient };
