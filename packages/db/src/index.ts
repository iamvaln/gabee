/**
 * @gabee/db — Prisma schema, generated client factory, and seed scripts.
 *
 * Consumers (apps/web route handlers) import `createPrismaClient`. Generated model
 * types live under `./generated/prisma`; import them from there when needed (kept out
 * of this barrel to avoid name clashes with @gabee/types enums like `Module`).
 */
export { createPrismaClient, PrismaClient } from './client';
export { Prisma } from './generated/prisma/client';
