import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * The Hours suite, runnable from a PORT-ISOLATED program (hour tracking, W2).
 *
 * `playwright.config.ts` hardcodes `:3000` and the `:54321` stack, which is
 * fine for one checkout and wrong for a parallel one: with another program's
 * dev server holding 3000 and `reuseExistingServer: !CI`, a run signs into THAT
 * portal against THAT program's database and reports a green about somebody
 * else's code. This config derives from the base and overrides only the port
 * and the stack behind it.
 *
 * It is a separate file, not an edit to the base, for the reason
 * `playwright.ship-bar.config.ts` gives: the base carries the local CLI's demo
 * `service_role` JWT, the pre-commit secret scan reads a changed file's FULL
 * staged content, and so any edit to it — any line — blocks the commit. This
 * file carries no literal keys: the stack's keys arrive through env vars, or it
 * refuses to run.
 *
 *   PLAYWRIGHT_DESIGNER_PORT                 default 3000 (the base's port)
 *   PLAYWRIGHT_SUPABASE_URL                  default: the base's 54321 stack
 *   PLAYWRIGHT_SUPABASE_ANON_KEY             required with the URL
 *   PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY     required with the URL
 *
 * Example (hour tracking's own stack, project_id "patina-hours"):
 *   PLAYWRIGHT_DESIGNER_PORT=3100 \
 *   PLAYWRIGHT_SUPABASE_URL=http://127.0.0.1:54421 \
 *   PLAYWRIGHT_SUPABASE_ANON_KEY=… PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY=… \
 *   NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
 *   pnpm --filter @patina/designer-portal test:e2e -- \
 *     --config playwright.hours.config.ts e2e/document/hours.spec.ts
 */

const PORT = process.env.PLAYWRIGHT_DESIGNER_PORT ?? '3000';
const BASE_URL = `http://localhost:${PORT}`;

/** The suite seeds and asserts against a LOCAL stack only — never Strata. */
function loopbackOnly(name: string, value: string): string {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(value)) {
    throw new Error(`${name} must be a loopback Supabase URL (got "${value}").`);
  }
  return value;
}

function requiredWithUrl(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `PLAYWRIGHT_SUPABASE_URL names another local stack, so ${name} must be set ` +
        `too — the base config's keys belong to the 54321 stack.`,
    );
  }
  return value;
}

/** Empty unless another stack is named, so an ordinary run is the base's. */
const stackOverride: Record<string, string> = process.env.PLAYWRIGHT_SUPABASE_URL
  ? {
      NEXT_PUBLIC_SUPABASE_URL: loopbackOnly(
        'PLAYWRIGHT_SUPABASE_URL',
        process.env.PLAYWRIGHT_SUPABASE_URL,
      ),
      SUPABASE_URL: loopbackOnly(
        'PLAYWRIGHT_SUPABASE_URL',
        process.env.PLAYWRIGHT_SUPABASE_URL,
      ),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredWithUrl('PLAYWRIGHT_SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: requiredWithUrl('PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY'),
    }
  : {};

const baseWebServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: BASE_URL },
  // The Hours specs are single-seeded-actor and chromium-pinned in the spec
  // itself; declaring one project keeps the run's output honest about that.
  projects: [{ name: 'chromium', use: { ...base.projects?.[0]?.use } }],
  webServer: {
    ...baseWebServer,
    // `pnpm dev` pins `-p 3000`; the port has to come through next directly.
    command: `pnpm run sync-pdf-worker && pnpm exec next dev --webpack -p ${PORT}`,
    url: BASE_URL,
    env: { ...baseWebServer?.env, ...stackOverride },
  },
});
