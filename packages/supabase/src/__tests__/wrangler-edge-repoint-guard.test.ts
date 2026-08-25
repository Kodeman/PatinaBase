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

  it("infra/deploy-portal.sh: the allowlist literal appears exactly once (drift guard)", () => {
    const scriptPath = resolve(REPO_ROOT, "infra/deploy-portal.sh");
    const script = readFileSync(scriptPath, "utf-8");
    const occurrences = script.split(ALLOWED_RUNTIME_ORIGIN).length - 1;
    expect(occurrences).toBe(1);
  });
});
