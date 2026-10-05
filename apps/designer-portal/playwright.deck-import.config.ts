import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Bring in a Deck (US-15) end-to-end suite — e2e/deck-import only (SQ-364).
 *
 * A separate file, not an edit to the base, for the reason
 * `playwright.hours.config.ts` gives: the base carries the local CLI's demo
 * keys and the pre-commit secret scan reads a changed file's full staged
 * content. This file carries no keys.
 *
 * What it adds over the base:
 *   - the deck flags, merged OVER the base's flags key by key:
 *     board-deck-import, board-photo-match, board-web-match — all on, or with
 *     DECK_IMPORT_FLAGS=off, board-deck-import:false (the "flag off" guard,
 *     which needs its own server because NEXT_PUBLIC_* is inlined at start);
 *   - the fixture server (e2e/deck-import/fixture-server.mjs) that the edge
 *     functions reach through DECK_IMPORT_TEST_FETCH_BASE;
 *   - its own port (default 3364), so a run never reuses another program's
 *     dev server on :3000 and reports a green about somebody else's code.
 *
 * The edge functions must be served from THIS checkout with the fixture base.
 * Without a served edge runtime, Kong answers 503 "name resolution failed" and
 * every project-board lay-out fails at project-review-media (SQ-359 carry-in):
 *
 *   printf '%s\n' DECK_IMPORT_TEST_FETCH_BASE=http://host.docker.internal:4599 \
 *     GOOGLE_VISION_API_KEY=e2e-fixture > "$TMPDIR/deck-e2e.env"
 *   supabase functions serve --env-file "$TMPDIR/deck-e2e.env"
 *
 * The CLI's edge container may not resolve host.docker.internal (its DNS is
 * pinned to public resolvers); the resolver then reads every link as
 * link-only ("fetch_failed"). Map it to Docker Desktop's host address once
 * the serve is up, and again after anything restarts the container:
 *
 *   docker exec -u root supabase_edge_runtime_supabase sh -c \
 *     'echo "192.168.65.254 host.docker.internal" >> /etc/hosts'
 *
 * The suite works on its own copy of the seeded project under an RFC 4122 id
 * (deck-helpers ensureDeckProject): project-review-media refuses the seeded
 * b0000000-… ids.
 *
 * test_fetch_base.ts honours the base only on a local stack with a loopback
 * or docker-internal base. GOOGLE_VISION_API_KEY is any non-empty value: with
 * the base set, Vision calls go to the fixture server, never to Google.
 *
 * Run (the specs are chromium-pinned; they own shared seeded rows):
 *   pnpm --filter @patina/designer-portal exec playwright test \
 *     --config playwright.deck-import.config.ts
 *   DECK_IMPORT_FLAGS=off PLAYWRIGHT_DESIGNER_PORT=3365 \
 *   pnpm --filter @patina/designer-portal exec playwright test \
 *     --config playwright.deck-import.config.ts e2e/deck-import/guards.spec.ts -g "flag off"
 *
 *   PLAYWRIGHT_DESIGNER_PORT   default 3364
 *   DECK_FIXTURE_PORT          default 4599 (must match the functions' base)
 *   DECK_IMPORT_FLAGS          "off" turns board-deck-import off
 */

const PORT = process.env.PLAYWRIGHT_DESIGNER_PORT ?? '3364';
const BASE_URL = `http://localhost:${PORT}`;
const FIXTURE_PORT = process.env.DECK_FIXTURE_PORT ?? '4599';
process.env.DECK_FIXTURE_PORT = FIXTURE_PORT;

const DECK_FLAGS =
  process.env.DECK_IMPORT_FLAGS === 'off'
    ? 'board-deck-import:false,board-photo-match:true,board-web-match:true'
    : 'board-deck-import:true,board-photo-match:true,board-web-match:true';

function mergeFlagOverrides(...lists: Array<string | undefined>): string {
  const flags = new Map<string, string>();
  for (const list of lists) {
    for (const pair of (list ?? '').split(',')) {
      const trimmed = pair.trim();
      const at = trimmed.indexOf(':');
      if (at < 1) continue;
      flags.set(trimmed.slice(0, at).trim(), trimmed.slice(at + 1).trim());
    }
  }
  return [...flags].map(([name, value]) => `${name}:${value}`).join(',');
}

const baseWebServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;
const FLAG_OVERRIDES = mergeFlagOverrides(baseWebServer?.env?.NEXT_PUBLIC_FLAG_OVERRIDES, DECK_FLAGS);
// The specs read the flags from their own process (FLAG_ON skips).
process.env.NEXT_PUBLIC_FLAG_OVERRIDES = FLAG_OVERRIDES;
// The specs' service-role helper (e2e/helpers/supabase-admin.ts) uses the same
// local-stack values the base hands its server; an exported value wins.
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
  const value = baseWebServer?.env?.[name];
  if (!process.env[name] && value) process.env[name] = value;
}

export default defineConfig({
  ...base,
  testDir: './e2e/deck-import',
  fullyParallel: false,
  workers: 1,
  use: { ...base.use, baseURL: BASE_URL },
  projects: [
    {
      name: 'chromium',
      use: {
        ...(base.projects?.find((project) => project.name === 'chromium')?.use ??
          base.projects?.[0]?.use),
      },
    },
  ],
  webServer: [
    {
      ...baseWebServer,
      command: `pnpm run sync-pdf-worker && pnpm exec next dev --webpack -p ${PORT}`,
      url: BASE_URL,
      timeout: 300_000,
      env: { ...baseWebServer?.env, NEXT_PUBLIC_FLAG_OVERRIDES: FLAG_OVERRIDES },
    },
    {
      command: 'node e2e/deck-import/fixture-server.mjs',
      url: `http://127.0.0.1:${FIXTURE_PORT}/health`,
      reuseExistingServer: true,
      timeout: 15_000,
      env: { DECK_FIXTURE_PORT: FIXTURE_PORT },
    },
  ],
});
