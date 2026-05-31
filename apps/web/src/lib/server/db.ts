import { createPrismaClient, type PrismaClient } from '@gabee/db';
import { IS_PROD } from './env';

// Reuse one Prisma client across hot-reloads in dev (avoid exhausting connections).
const globalForPrisma = globalThis as unknown as { __gabeePrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__gabeePrisma ?? createPrismaClient();

if (!IS_PROD) globalForPrisma.__gabeePrisma = prisma;
