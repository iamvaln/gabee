import { createPrismaClient, type PrismaClient } from '@gabee/db';
import { env, IS_PROD } from './env';

// Importing `env` here guarantees DATABASE_URL is validated before the Prisma
// client tries to use it — a missing var throws at boot, not on the first query.
void env.DATABASE_URL;

// Reuse one Prisma client across hot-reloads in dev (avoid exhausting connections).
const globalForPrisma = globalThis as unknown as { __gabeePrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__gabeePrisma ?? createPrismaClient();

if (!IS_PROD) globalForPrisma.__gabeePrisma = prisma;
