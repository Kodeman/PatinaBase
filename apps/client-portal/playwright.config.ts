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
 * ONE server, ONE project.
 *
 * Until wave 2 this file ran two dev servers: :3002 for the shipped surface
 * and :3102 carrying `NEXT_PUBLIC_FLAG_OVERRIDES=threshold:true` for
 * `threshold.spec.ts`, plus a `NEXT_DIST_DIR=.next-threshold` so the two
 * copies of the same app did not share and corrupt one `.next`. The flag was
 * the only thing that ever differed between them, and the flag is gone — no
 * code reads `threshold` or `single-pane` any more, and every client meets the
 * chrome-less house. Two servers that render the same surface are two chances
 * to boot the wrong one, so the split (and the dist-dir special-casing it
 * needed) comes out here.
 *
 * The Supabase pins stay, and they are the point: apps/client-portal/.env.local
 * has pointed at Strata PROD before, and this suite reads and writes the LOCAL
 * stack.
 *
 * US-49 brings a second server back, for the same reason the first split
 * existed: a flag the suite must see both ways. `client-edition-page` (The
 * House Issue) is read through `NEXT_PUBLIC_FLAG_OVERRIDES`, which Next inlines
 * when the dev server starts, so "on" and "off" cannot share one server. :3002
 * stays the shipped surface with no override; :3102 carries the override and
 * its own NEXT_DIST_DIR (next.config.js) so the two copies of the app never
 * share one build directory. That directory sits INSIDE `.next` because the
 * webpack watcher ignores `.next/**` but not a sibling like `.next-edition`:
 * outside it, each server watched the other's writes and forced browser full
 * reloads mid-test. The `edition` project runs only what must see the flag on:
 * every test tagged `@edition` (house-issue.spec.ts and the flag-on anchor
 * check in threshold.spec.ts); `edition-usability` runs the whole of
 * homeowner-usability.spec.ts there too, so it holds both ways.
 * `@edition-only` keeps a flag-on test off the shipped server.
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
      // The usability contract holds with the edition on too: the whole file,
      // against the flag-on server.
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
      // The House Issue on. Never reused from a stray :3102 that might carry a
      // different override; started and stopped by this run.
      command: 'pnpm exec next dev --webpack -p 3102',
      url: 'http://localhost:3102',
      reuseExistingServer: false,
      timeout: 180000,
      env: {
        ...LOCAL_SUPABASE_ENV,
        NEXT_PUBLIC_FLAG_OVERRIDES: 'client-edition-page:true',
        NEXT_DIST_DIR: '.next/edition',
      },
    },
  ],
});
