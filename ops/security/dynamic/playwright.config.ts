import { defineConfig, devices } from '@playwright/test';

// Dynamic security probes. baseURL is the ephemeral throwaway target
// (ops/security/dynamic/target.sh). Only the `request` fixture is used today, so
// no browser binaries are required; add `npx playwright install chromium` + a
// browser project here when DOM/XSS probes land.
export default defineConfig({
  testDir: './probes',
  fullyParallel: false,          // rate-limit probes share per-IP limiter state
  workers: 1,
  reporter: [['line'], ['json', { outputFile: '../../../.security/raw/playwright.json' }]],
  use: {
    baseURL: process.env.SEC_BASE_URL,
    extraHTTPHeaders: { 'content-type': 'application/json' },
  },
  projects: [{ name: 'api', use: { ...devices['Desktop Chrome'] } }],
});
