import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/**
 * W3b — the arrival's own Playwright lane (US-14, CONTRACT §5 "W3b · lane author").
 *
 * `playwright.config.ts` is not editable for this seam, for the same reason
 * `playwright.hours.config.ts` and `playwright.ship-bar.config.ts` give in their
 * own headers: the base file carries the local Supabase CLI's demo `service_role`
 * JWT literally in its `webServer.env` block, and the pre-commit secret scan reads
 * a changed file's FULL staged content (not a diff) — any edit to that file, any
 * line, re-triggers the JWT finding and blocks the commit. This file carries NO
 * literal keys anywhere: it derives from the base config and overrides only what
 * the lane needs (port, testDir, projects, the server command). The base's own
 * `webServer.env` (already committed, already scanned) is passed through by
 * reference, never re-typed here.
 *
 * Port 3107, not 3000: the legacy 36-spec regression (CONTRACT §5 W0/W3b) and this
 * lane must be able to run against two DIFFERENT servers at once without either
 * reusing the other's — `reuseExistingServer: false` below makes that explicit
 * rather than accidental (the base config's `!process.env.CI` default would
 * happily attach to whatever was already listening on the wrong port).
 *
 * `next start`, never `next dev`: the arrival gates on `next/font` CSS variables,
 * the compiled `arrival.css` sentinel (`--arr-ok`), and production chunk boundaries
 * (CONTRACT §5 "grep -rl bkvcixdmuyejfzcijpdg .next/static must be empty") — none
 * of which a dev-mode HMR server represents faithfully. The build already exists
 * at `.next` (built by the integrator's setup step, with `ARRIVAL_E2E=1` so the
 * CSP carries no `upgrade-insecure-requests` — next.config.js; WebKit would
 * otherwise upgrade every http://127.0.0.1 subresource to https and the auth
 * fixture never signs in); this config only serves it.
 */

const PORT = 3107;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const baseWebServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  testDir: './e2e/arrival',
  // Absorbs the first-real-request cost of a freshly started `next start`
  // process (Supabase server client construction, the auth middleware's
  // first JWT verify) before any spec's own clock starts — see
  // `global-setup.ts`'s header for the recurring flake this fixes.
  globalSetup: require.resolve('./e2e/arrival/global-setup'),
  timeout: 90_000,
  // Serial, and no retry: the lane's earlier reds were the probes (a zero-height
  // `.arr-card` that `toBeVisible()` never reports visible) and WebKit's
  // https upgrade, not machine contention — a retry would only hide a real red.
  workers: 1,
  retries: 0,
  use: {
    ...base.use,
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  // Three projects only (CONTRACT §5 W3b) — chromium and webkit at desktop size,
  // plus a phone-viewport Chromium project for the long-form headline spec (D2).
  // `mobile-chrome` borrows the iPhone 14 device profile (viewport/touch/scale)
  // but forces the Chromium engine: an iPhone's own `defaultBrowserType` is
  // webkit, and this lane wants Chromium's DevTools Protocol (CDP) for the
  // `elementFromPoint`/screenshot visibility instruments the deliverable asks
  // for, at a phone's width.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    ...baseWebServer,
    command: `pnpm exec next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    // Pass the base config's own env straight through — no literal key is typed
    // in THIS file. `next start` serves the existing production build; the
    // NEXT_PUBLIC_* values baked into that build already came from this same
    // trio (the integrator's build step), so re-supplying them here only
    // affects server-side-only reads (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL,
    // SUPABASE_JWT_SECRET) that `next start`'s Node process reads live.
    env: { ...baseWebServer?.env },
  },
});
