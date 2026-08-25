import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-repoint wiring guard (designer-portal edge repoint, D-B4): a data-driven
 * check over apps/designer-portal/wrangler.jsonc + infra/deploy-portal.sh so
 * the D-repoint flip stays scoped to exactly what was reviewed:
 *
 *  - IF `SUPABASE_ORIGIN_RUNTIME` is ever set on the designer-portal's prod
 *    vars, it must equal the ONE sanctioned repoint target
 *    (https://api.patina.cloud) — not some other, unreviewed origin. This
 *    wiring PR itself does NOT set the var (the flip is a later, separate
 *    step); this only guards the value once someone does flip it.
 *  - `NEXT_PUBLIC_SUPABASE_URL` (the build-time / storage-direct URL) stays
 *    a real `*.supabase.co` host — packages/supabase/src/client.ts's
 *    pinStorageDirect() constructs the Storage client straight from this
 *    value, so it must never silently become the edge-API host itself.
 *  - infra/deploy-portal.sh's allowlist carve-out literal
 *    (`https://api.patina.cloud`) appears EXACTLY once — a drift guard so a
 *    future edit can't quietly duplicate/diverge the allowed-origin string
 *    the preflight guard checks against.
 *
 * Uses the same dependency-free JSONC stripper as wrangler-storage-key-pin.test.ts
 * (every wrangler.jsonc in this repo uses only `//` line comments).
 */

const REPO_ROOT = resolve(__dirname, "../../../..");

const ALLOWED_RUNTIME_ORIGIN = "https://api.patina.cloud";

function stripJsonComments(input: string): string {
  let out = "";
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

interface WranglerVars {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ORIGIN_RUNTIME?: string;
  NEXT_PUBLIC_EDGE_API_URL?: string;
  [key: string]: unknown;
}

interface WranglerConfig {
  vars?: WranglerVars;
  env?: {
    staging?: { vars?: WranglerVars };
    [key: string]: unknown;
  };
}

function readDesignerWranglerConfig(): WranglerConfig {
  const path = resolve(REPO_ROOT, "apps/designer-portal/wrangler.jsonc");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(stripJsonComments(raw)) as WranglerConfig;
}

describe("D-repoint wiring guard: designer-portal edge repoint stays scoped", () => {
  it("prod vars: SUPABASE_ORIGIN_RUNTIME, if present, equals exactly the sanctioned repoint target", () => {
    const config = readDesignerWranglerConfig();
    const runtimeOrigin = config.vars?.SUPABASE_ORIGIN_RUNTIME;

    if (runtimeOrigin === undefined) {
      // Expected today: the flip is a later, separate step from this wiring PR.
      return;
    }
    expect(runtimeOrigin).toBe(ALLOWED_RUNTIME_ORIGIN);
  });

  it("prod vars: NEXT_PUBLIC_SUPABASE_URL remains a real *.supabase.co host (storage-direct base)", () => {
    const config = readDesignerWranglerConfig();
    const url = config.vars?.NEXT_PUBLIC_SUPABASE_URL;

    expect(
      url,
      "designer-portal wrangler.jsonc vars.NEXT_PUBLIC_SUPABASE_URL",
    ).toBeTruthy();
    expect(new URL(url!).hostname.endsWith(".supabase.co")).toBe(true);
  });

  it("staging vars: NEXT_PUBLIC_SUPABASE_URL remains a real *.supabase.co host", () => {
    const config = readDesignerWranglerConfig();
    const url = config.env?.staging?.vars?.NEXT_PUBLIC_SUPABASE_URL;

    expect(
      url,
      "designer-portal wrangler.jsonc env.staging.vars.NEXT_PUBLIC_SUPABASE_URL",
    ).toBeTruthy();
    expect(new URL(url!).hostname.endsWith(".supabase.co")).toBe(true);
  });

  // F10: the carve-out in infra/deploy-portal.sh is scoped to
  // PORTAL=designer && TARGET_ENV=production only (see F11 below) — but
  // that scoping is only as good as the values actually committed to
  // wrangler.jsonc. If SUPABASE_ORIGIN_RUNTIME is ever set on staging, it
  // must never be the prod edge-API origin (staging is a SEPARATE Supabase
  // project — pointing it at the prod edge worker is the exact
  // cross-project hazard this guard family exists to catch). Designer-only
  // scope for now; extend to other portals' wrangler.jsonc if they ever
  // grow a SUPABASE_ORIGIN_RUNTIME var.
  it("staging vars: SUPABASE_ORIGIN_RUNTIME, if present, is NOT the prod edge-API origin", () => {
    const config = readDesignerWranglerConfig();
    const stagingRuntimeOrigin =
      config.env?.staging?.vars?.SUPABASE_ORIGIN_RUNTIME;

    if (stagingRuntimeOrigin === undefined) {
      // Expected today: staging doesn't set this var.
      return;
    }
    expect(stagingRuntimeOrigin).not.toBe(ALLOWED_RUNTIME_ORIGIN);
  });

  // F5: @supabase/storage-js must stay version-locked to whatever
  // @supabase/supabase-js bundles internally (packages/supabase/package.json's
  // "_versionLocks" comment) — pinStorageDirect() constructs a StorageClient
  // directly from this package and reaches into SupabaseClient's
  // protected `headers`/`fetch`/`storage` fields, which rely on the two
  // packages' shapes staying identical. A future supabase-js bump that
  // drifts its internal storage-js version without this package's pin
  // being bumped in lockstep must fail loudly here, not silently at
  // runtime.
  it("@supabase/storage-js stays version-locked to what @supabase/supabase-js bundles internally", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const supabaseJsPkg = require("@supabase/supabase-js/package.json") as {
      dependencies?: Record<string, string>;
    };
    const bundledStorageJsVersion =
      supabaseJsPkg.dependencies?.["@supabase/storage-js"];

    const ownPkg = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, "packages/supabase/package.json"),
        "utf-8",
      ),
    ) as { dependencies?: Record<string, string> };
    const pinnedStorageJsVersion =
      ownPkg.dependencies?.["@supabase/storage-js"];

    expect(
      bundledStorageJsVersion,
      "@supabase/supabase-js's package.json dependencies['@supabase/storage-js']",
    ).toBeTruthy();
    expect(
      pinnedStorageJsVersion,
      "packages/supabase/package.json dependencies['@supabase/storage-js']",
    ).toBeTruthy();
    expect(pinnedStorageJsVersion).toBe(bundledStorageJsVersion);
  });

  // F11: a plain "does the URL string appear exactly once" count doesn't
  // actually protect the policy — someone could widen the comparison to a
  // prefix/glob match (`case $PREFLIGHT_ORIGIN_RUNTIME in api.patina.cloud*)`)
  // or add a second allowlist variable without ever touching the literal
  // string, and this test would stay green. Assert the carve-out's exact
  // shape instead: an EXACT equality comparison against
  // $ALLOWED_RUNTIME_ORIGIN, gated behind a flag that is true ONLY when
  // BOTH TARGET_ENV=production AND PORTAL=designer, with exactly one
  // allowlist variable declared.
  it("infra/deploy-portal.sh: the carve-out's exact-match, production+designer-scoped policy shape is intact", () => {
    const scriptPath = resolve(REPO_ROOT, "infra/deploy-portal.sh");
    const script = readFileSync(scriptPath, "utf-8");

    // Exactly one allowlist variable is declared — a second allowlist var
    // (e.g. a differently-named fallback) would defeat the "one sanctioned
    // repoint target" invariant this guard exists to enforce.
    const allowlistAssignments =
      script.match(/^ALLOWED_RUNTIME_ORIGIN[A-Z0-9_]*=/gm) ?? [];
    expect(allowlistAssignments).toEqual(["ALLOWED_RUNTIME_ORIGIN="]);
    expect(script).toContain(
      `ALLOWED_RUNTIME_ORIGIN="${ALLOWED_RUNTIME_ORIGIN}"`,
    );

    // The comparison against it must be an EXACT string-equality test
    // (`[ "$x" = "$ALLOWED_RUNTIME_ORIGIN" ]`), not a prefix/glob/regex
    // match. It appears twice by design: once to decide whether the
    // carve-out is satisfied, once to decide whether to print the loud
    // "RUNTIME REPOINT ACTIVE" line — both must use the same exact
    // comparison, never a widened one.
    const exactMatchPattern =
      /\[\s*"\$PREFLIGHT_ORIGIN_RUNTIME"\s*=\s*"\$ALLOWED_RUNTIME_ORIGIN"\s*\]/g;
    const exactMatchOccurrences = script.match(exactMatchPattern) ?? [];
    expect(exactMatchOccurrences.length).toBe(2);

    // That exact-match comparison must sit behind a carve-out flag that is
    // set true ONLY when BOTH TARGET_ENV=production AND PORTAL=designer —
    // dropping either condition, or loosening either comparison, must fail
    // this test.
    const carveoutGatePattern =
      /if\s*\[\s*"\$TARGET_ENV"\s*=\s*"production"\s*\]\s*&&\s*\[\s*"\$PORTAL"\s*=\s*"designer"\s*\]\s*;\s*then\s*\n\s*CARVEOUT_APPLIES=true/;
    expect(carveoutGatePattern.test(script)).toBe(true);
  });
});
