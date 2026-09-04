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

const THRESHOLD_SPEC = /threshold\.spec\.ts/;
const THRESHOLD_PORT = 3102;

/**
 * TWO servers, because `NEXT_PUBLIC_*` is inlined when a dev server starts and
 * a flag override therefore belongs to the server, not to a spec. Carrying
 * `threshold:true` on the shared :3002 server turned the flag on for EVERY
 * client-portal spec, and eight top-level routes — `/documents`, `/today`,
 * `/proposals` among them — collapse to project anchors under it, so
 * `plan-set` and its neighbours were quietly testing a surface no shipped
 * client sees.
 *
 * :3002 is the shipped surface and carries NO override. :3102 is the Threshold,
 * and only `tests/threshold.spec.ts` runs against it.
 *
 * The split is expressed as static `projects` and a static `webServer` array,
 * never conditioned on `--project`: Playwright re-evaluates this file in each
 * worker process WITHOUT the CLI's project flag, so an argv-conditional
 * project list fails with "Project ... not found in the worker process".
 * Both servers therefore start on any invocation, which is why they need
 * separate build directories (NEXT_DIST_DIR, see next.config.js) — same app,
 * same folder, and one shared `.next` corrupts both.
 */
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
      // The Threshold is not part of the default sweep: it needs the flagged
      // server, and against the shipped chrome every assertion in it is wrong.
      testIgnore: THRESHOLD_SPEC,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'threshold',
      testMatch: THRESHOLD_SPEC,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${THRESHOLD_PORT}`,
      },
    },
  ],
  webServer: [
    {
      // Self-boots :3002 for the share/board specs, but reuses an
      // already-running dev server when one is up (the usual local case).
      // Pinned at the LOCAL stack for the same reason as the server below —
      // .env.local has pointed at Strata PROD before — but carrying NO flag
      // override, so every default-project spec meets the shipped surface.
      command: 'pnpm dev',
      url: 'http://localhost:3002',
      reuseExistingServer: true,
      timeout: 120000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      },
    },
    {
      // The flagged server. Never reused — an already-running :3102 would have
      // been started by someone else with unknown env, and a known env is the
      // entire point of this entry. The Supabase pins are here because
      // apps/client-portal/.env.local has pointed at Strata PROD before, and
      // this suite reads and writes the LOCAL stack.
      command: `pnpm exec next dev --webpack -p ${THRESHOLD_PORT}`,
      url: `http://localhost:${THRESHOLD_PORT}`,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NEXT_DIST_DIR: '.next-threshold',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
        NEXT_PUBLIC_FLAG_OVERRIDES: 'threshold:true',
      },
    },
  ],
});
