import { defineConfig, devices } from '@playwright/test';

export const WEB_URL = 'http://localhost:3000';
export const KID_URL = 'http://localhost:5173';

// Local default matches packages/db's db:migrate:test fallback (brew Postgres, trust auth).
// CI overrides via TEST_DATABASE_URL. Guard: e2e must never point at a non-test DB.
export const DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/gabee_test';
if (!DB_URL.includes('_test')) {
  throw new Error(`Refusing e2e against non-test database: ${DB_URL}`);
}
// next start runs NODE_ENV=production, which hard-requires AUTH_JWT_SECRET (env.ts).
const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? 'e2e-only-jwt-secret-not-for-production';

// Workers and helpers (helpers/db.ts createTestClient) inherit these.
process.env.TEST_DATABASE_URL ??= DB_URL;
process.env.AUTH_JWT_SECRET ??= JWT_SECRET;

export default defineConfig({
  testDir: './tests',
  timeout: 180_000, // one test walks two full 7-question sessions
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // shared DB + stateful kid flow — never parallelize
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: KID_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'kid', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @gabee/web run start',
      url: `${WEB_URL}/api/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: DB_URL,
        DIRECT_URL: DB_URL,
        AUTH_JWT_SECRET: JWT_SECRET,
        KID_APP_ORIGIN: KID_URL, // CORS allow-origin for the kid app (env.ts default is the same value; explicit > implicit)
      },
    },
    {
      command: 'pnpm --filter @gabee/kid run preview --port 5173 --strictPort',
      url: KID_URL,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
