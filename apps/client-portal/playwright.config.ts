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
      use: { ...devices['Desktop Chrome'] },
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
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      },
    },
  ],
});
