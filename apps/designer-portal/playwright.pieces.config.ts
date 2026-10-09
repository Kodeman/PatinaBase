import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * The Build room walk (US-21 T-59): e2e/document/pieces-build-room.spec.ts.
 *
 * A separate file, not an edit to the base, for the reason
 * `playwright.buying.config.ts` gives: the base carries the local CLI's demo
 * keys, and the pre-commit secret scan reads a changed file's full staged
 * content. This file carries no keys. The spec seeds through
 * e2e/helpers/psql.ts, which talks only to the local stack.
 *
 * What it adds over the base:
 *   - the walk's flags, `ask-the-paper` and `one-voice`, appended to the
 *     base's NEXT_PUBLIC_FLAG_OVERRIDES at runtime;
 *   - its own port (default 3410), so a run never reuses a dev server on
 *     :3000 that was started with those flags off;
 *   - chromium only, one worker: every scenario reseeds one shared job.
 *
 * Run:
 *   cd apps/designer-portal && pnpm exec playwright test \
 *     e2e/document/pieces-build-room.spec.ts \
 *     --config playwright.pieces.config.ts --project=chromium
 *
 *   PLAYWRIGHT_DESIGNER_PORT   default 3410
 */

const PORT = process.env.PLAYWRIGHT_DESIGNER_PORT ?? "3410";
const BASE_URL = `http://localhost:${PORT}`;

const baseWebServer = Array.isArray(base.webServer)
  ? base.webServer[0]
  : base.webServer;

export default defineConfig({
  ...base,
  testDir: "./e2e/document",
  fullyParallel: false,
  workers: 1,
  use: { ...base.use, baseURL: BASE_URL },
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
    env: {
      ...baseWebServer?.env,
      NEXT_PUBLIC_FLAG_OVERRIDES: [
        baseWebServer?.env?.NEXT_PUBLIC_FLAG_OVERRIDES,
        "ask-the-paper:true",
        "one-voice:true",
      ]
        .filter(Boolean)
        .join(","),
    },
  },
});
