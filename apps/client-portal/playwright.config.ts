import { defineConfig, devices } from '@playwright/test';

// The Supabase CLI's fixed local demo anon key — the one `supabase status`
// prints on every machine. It is signed with the public demo JWT secret and
// authorizes nothing outside a local stack; no production key belongs here.
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// The matching local service-role key is NOT written here: the repo's
// pre-commit scan rejects any file whose content carries a service_role JWT,
// demo key included, and bypassing that scan is not a lane's call. It is read
// from the environment instead — export it from `supabase status` when a spec
// needs it. Absent, client-portal middleware's role lookup reports
// `unavailable` and lets the request through (src/middleware.ts), so the page
// under test still renders; what this pinning guarantees is that a PRODUCTION
// service-role key can never reach the local server by way of .env.local.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/**
 * Both test servers render the same ungated House Issue. Keep the existing
 * edition projects as focused fixture groups, with separate build directories.
 * The local Supabase pins prevent .env.local from pointing tests at Strata.
 */
const LOCAL_SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /house-issue\.spec\.ts$/,
      grepInvert: /@edition-only/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'edition',
      testMatch: /(house-issue|threshold)\.spec\.ts$/,
      grep: /@edition/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3102' },
    },
    {
      // The complete usability contract on the edition fixture server.
      name: 'edition-usability',
      testMatch: /homeowner-usability\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3102' },
    },
  ],
  webServer: [
    {
      // Reuses an already-running dev server when one is up (the usual local
      // case). Pinned at the LOCAL stack — see the note above.
      command: 'pnpm dev',
      url: 'http://localhost:3002',
      reuseExistingServer: true,
      timeout: 120000,
      env: LOCAL_SUPABASE_ENV,
    },
    {
      // Dedicated edition fixture server, started and stopped by this run.
      command: 'pnpm exec next dev --webpack -p 3102',
      url: 'http://localhost:3102',
      reuseExistingServer: false,
      timeout: 180000,
      env: {
        ...LOCAL_SUPABASE_ENV,
        NEXT_DIST_DIR: '.next/edition',
      },
    },
  ],
});
