import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Studio buying Phase 0 (US-16) end-to-end suite — e2e/buying only (SQ-400).
 *
 * A separate file, not an edit to the base, for the reason
 * `playwright.hours.config.ts` gives: the base carries the local CLI's demo
 * keys and the pre-commit secret scan reads a changed file's full staged
 * content. This file carries no keys; the specs' service-role helper takes
 * SUPABASE_SERVICE_ROLE_KEY from the environment, or from the base's
 * local-stack server env when none is exported.
 *
 * What it adds over the base:
 *   - its own port (default 3400), so a run never reuses another program's
 *     dev server on :3000 and reports a green about somebody else's code;
 *   - chromium only, one worker: the walk seeds and advances one PO.
 *
 * Preconditions (local stack only — the seed helpers refuse anything else):
 *
 *   pnpm supabase:reset
 *   printf '%s\n' EMAIL_DEV_MODE=dry_run > "$TMPDIR/buying-e2e.env"
 *   supabase functions serve --env-file "$TMPDIR/buying-e2e.env"
 *
 * po-send must be served from THIS checkout: without an edge runtime Kong
 * answers the send with an error and the walk stops at step 4.
 * EMAIL_DEV_MODE=dry_run keeps the vendor email inside the function (it logs
 * the payload and reports delivered); nothing leaves the machine.
 *
 * Run:
 *   pnpm --filter @patina/designer-portal exec playwright test \
 *     --config playwright.buying.config.ts
 *
 *   PLAYWRIGHT_DESIGNER_PORT   default 3400
 */

const PORT = process.env.PLAYWRIGHT_DESIGNER_PORT ?? "3400";
const BASE_URL = `http://localhost:${PORT}`;

const baseWebServer = Array.isArray(base.webServer)
  ? base.webServer[0]
  : base.webServer;
// The specs' service-role helper (e2e/helpers/supabase-admin.ts) uses the same
// local-stack values the base hands its server; an exported value wins.
for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const) {
  const value = baseWebServer?.env?.[name];
  if (!process.env[name] && value) process.env[name] = value;
}

export default defineConfig({
  ...base,
  testDir: "./e2e/buying",
  fullyParallel: false,
  workers: 1,
  use: { ...base.use, baseURL: BASE_URL, screenshot: "only-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...(base.projects?.find((project) => project.name === "chromium")
          ?.use ?? base.projects?.[0]?.use),
      },
    },
  ],
  webServer: {
    ...baseWebServer,
    command: `pnpm exec next dev --webpack -p ${PORT}`,
    url: BASE_URL,
    timeout: 300_000,
  },
});
