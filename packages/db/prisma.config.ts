import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 config (https://www.prisma.io/docs/orm/reference/prisma-config-reference).
// Env vars are NOT auto-loaded in v7 — `dotenv/config` above loads .env explicitly.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Connection URLs live here in v7 (no longer in the schema). Migrations use the
  // direct (non-pooled) Supabase connection; the app runtime connects via the pg
  // driver adapter (DATABASE_URL) in src/client.ts.
  datasource: {
    url: env('DIRECT_URL'),
  },
});
