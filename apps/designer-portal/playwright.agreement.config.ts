import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * "The Agreement, Composed" W1 — the composer's e2e config.
 *
 * `playwright.config.ts` is not editable from a lane: it carries the local
 * Supabase CLI's demo `service_role` JWT in its `webServer.env`, and the
 * pre-commit secret scan (`scripts/hooks/core.mjs` `scanSecrets`) reads a
 * changed file's FULL staged content rather than a diff — any edit to that
 * file, on any line, re-triggers the finding and blocks the commit
 * (`feedback_playwright_config_secret_scan_trap.md`; the same reason
 * `playwright.ship-bar.config.ts` exists). So the one thing this suite needs
 * from the base config — `agreement-parts` pinned on in the server Playwright
 * starts — is added here instead, by deriving.
 *
 * That pinned value beats `.env.local` and reaches only the server Playwright
 * boots. A REUSED dev server started without it serves the seven-facet room
 * and every assertion in `e2e/agreement/agreement-parts.spec.ts` fails; kill
 * the dev server and let this config boot its own.
 *
 * Run:
 *   pnpm --filter @patina/designer-portal test:e2e -- \
 *     --config playwright.agreement.config.ts \
 *     e2e/agreement/agreement-parts.spec.ts --project=chromium
 */
export default defineConfig({
  ...base,
  webServer: base.webServer
    ? {
        ...base.webServer,
        env: {
          ...(base.webServer as { env?: Record<string, string> }).env,
          NEXT_PUBLIC_FLAG_OVERRIDES: [
            (base.webServer as { env?: Record<string, string> }).env
              ?.NEXT_PUBLIC_FLAG_OVERRIDES,
            "agreement-parts:true",
          ]
            .filter(Boolean)
            .join(","),
        },
      }
    : undefined,
});
