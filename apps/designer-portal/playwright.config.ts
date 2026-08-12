import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Load env vars from .env.local / .env (Next.js convention) so the auth
// fixture and other helpers can see NEXT_PUBLIC_SUPABASE_URL etc.
function loadEnvFile(file: string): void {
  const full = path.resolve(__dirname, file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Per-test timeout. The shared auth fixture signs in through the UI and waits
   * on Next dev cold-compiles, whose internal waits alone approach the old 30s
   * default — making every auth-backed spec flaky on a cold server. 60s gives
   * headroom without masking genuinely hung tests. */
  timeout: 60_000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests.
   * Supabase must be started separately (`pnpm supabase:start && pnpm supabase db reset`)
   * so the seeded designer/client/decisions exist before the suite runs.
   */
  webServer: {
    command: 'pnpm dev',
    cwd: '.',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    /* Playwright merges this with process.env. Keep unrelated feature
     * workspaces deterministic in local and CI journeys. */
    env: {
      NEXT_PUBLIC_FLAG_OVERRIDES:
        'procurement-workspace-pilot:true,the-document-pilot:true',
      /* Self-safing override: apps/designer-portal/.env.local has legitimately
       * pointed NEXT_PUBLIC_SUPABASE_URL at Strata prod before (e2e history),
       * and the loadEnvFile() calls above put whatever .env.local has into
       * process.env, which this webServer block otherwise merges straight
       * through. This suite seeds via `e2e/helpers/psql.ts`, which refuses to
       * run against anything but a local Postgres — so the dev server it
       * drives MUST be pointed at that same local Supabase stack, never prod,
       * regardless of .env.local. Values are the local CLI's standard demo
       * keys (`supabase status`) / the local-dev default JWT secret already
       * in apps/designer-portal/.env — not secrets, safe to inline. */
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIxMDEyOTg0Njd9.gtakjfTVh_cwTPVSHT2aPLSv09paNkN0NFXqWwBivEa94oD421oqKSDmfB1mIef8J0AILHWs4DqZgf_6Kr8moA',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY:
        'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjEwMTI5ODQ2N30.2ryh1__R6k1MmK_gPtp9g8DcOUBhtyoZ-f6j5-HxM1mVcHxnWdGO5ePL1CmeZVwFmEki1MxYZkSp-zqLaBBExw',
      SUPABASE_JWT_SECRET: 'super-secret-jwt-token-with-at-least-32-characters-long',
    },
  },
});
