import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * "The Agreement, Composed" W3 — the turnkey class's e2e config.
 *
 * Its own config rather than an edit to `playwright.agreement.config.ts`, for
 * two reasons. Wave 1's config pins `agreement-parts` alone, and its spec
 * asserts on the Wave-1 rail footer; turning `agreement-library` on there
 * would change the room out from under a spec that is not this wave's.
 * And `playwright.config.ts` itself stays uneditable — it carries the local
 * Supabase CLI's demo `service_role` JWT and the pre-commit secret scan reads
 * a changed file's FULL staged content, so any edit to it, on any line, blocks
 * the commit (`feedback_playwright_config_secret_scan_trap.md`).
 *
 * All three flags are pinned here because `design-build` is fail-closed and
 * nested: the turnkey surfaces render only where `agreement-parts` and
 * `agreement-library` already do.
 *
 * The `.pw.ts` suffix keeps this spec OUT of the default designer e2e run —
 * the base config's `testDir: './e2e'` has no `testMatch`, so Playwright's
 * default would otherwise collect a spec whose flags are off in that run and
 * which therefore could only fail. (The build sheet named the file
 * `e2e/document/design-build.spec.ts`; that name would be collected by the
 * base config, so it is `e2e/agreement/design-build.pw.ts` instead — the same
 * deviation Wave 1 made, for the same reason.)
 *
 * Run:
 *   pnpm --filter @patina/designer-portal test:e2e -- \
 *     --config playwright.design-build.config.ts --project=chromium
 *
 * Requires the wave's two migrations on the local stack: the design-build
 * kind, `studio_license_attestations`, `agreement_jurisdiction_notices`,
 * `agreement_draw_invoices`, the seeded `patina.design_build` template, and
 * `studio_trade_agreements`.
 */
export default defineConfig({
  ...base,
  testMatch: "**/design-build.pw.ts",
  webServer: base.webServer
    ? {
        ...base.webServer,
        env: {
          ...(base.webServer as { env?: Record<string, string> }).env,
          NEXT_PUBLIC_FLAG_OVERRIDES: [
            (base.webServer as { env?: Record<string, string> }).env
              ?.NEXT_PUBLIC_FLAG_OVERRIDES,
            "agreement-parts:true",
            "agreement-library:true",
            "design-build:true",
          ]
            .filter(Boolean)
            .join(","),
        },
      }
    : undefined,
});
