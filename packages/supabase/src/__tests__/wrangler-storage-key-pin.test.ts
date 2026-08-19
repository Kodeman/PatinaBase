import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Workstream D-B1 fix F7 (adversarial review of docs/engineering/repoint-b0-audit.md
 * §5): a data-driven guard over every portal's `wrangler.jsonc`'s committed
 * `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` value, so the 8/8 (4 portals × prod +
 * staging) "pin matches today's URL-derivation" invariant is self-checking
 * instead of relying on someone noticing a stale value on the next
 * wrangler.jsonc edit.
 *
 * This does NOT mean the pin must always equal the URL-derived value forever
 * — the whole point of D-B1 is that after a future NEXT_PUBLIC_SUPABASE_URL
 * repoint (e.g. to api.patina.cloud) the pin is supposed to stay put while
 * the URL-derived value changes underneath it. This test only proves there
 * is currently NO repoint in flight and NO accidental divergence — i.e. it
 * guards the pre-repoint baseline this PR ships, not a permanent constraint.
 * A deliberate repoint should update this test alongside the wrangler.jsonc
 * edit that introduces the divergence.
 */

const REPO_ROOT = resolve(__dirname, "../../../..");

const PORTALS = ["designer", "admin", "client", "manufacturer"] as const;

/**
 * Minimal JSONC (JSON + `//` line comments) stripper — every portal's
 * `wrangler.jsonc` in this repo uses only `//` comments (no block comments,
 * no trailing commas), so this small, dependency-free stripper is
 * sufficient. Tracks string state so a `//` inside a URL string (e.g.
 * `"https://..."`) is never mistaken for a comment.
 */
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
  NEXT_PUBLIC_SUPABASE_STORAGE_KEY?: string;
  [key: string]: unknown;
}

interface WranglerConfig {
  vars?: WranglerVars;
  env?: {
    staging?: { vars?: WranglerVars };
    [key: string]: unknown;
  };
}

function readWranglerConfig(portal: (typeof PORTALS)[number]): WranglerConfig {
  const path = resolve(REPO_ROOT, `apps/${portal}-portal/wrangler.jsonc`);
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(stripJsonComments(raw)) as WranglerConfig;
}

/** Same formula @supabase/ssr / @supabase/supabase-js use to derive the
 * DEFAULT storage key when no explicit `auth.storageKey` is passed. */
function legacyDerivedStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

describe("D-B1 F7: wrangler.jsonc pinned storage key matches URL-derivation (pre-repoint baseline)", () => {
  for (const portal of PORTALS) {
    const config = readWranglerConfig(portal);

    it(`${portal}-portal: prod vars — NEXT_PUBLIC_SUPABASE_STORAGE_KEY matches the URL-derived value`, () => {
      const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_STORAGE_KEY } =
        config.vars ?? {};
      expect(
        NEXT_PUBLIC_SUPABASE_URL,
        `${portal}-portal wrangler.jsonc vars.NEXT_PUBLIC_SUPABASE_URL`,
      ).toBeTruthy();
      expect(
        NEXT_PUBLIC_SUPABASE_STORAGE_KEY,
        `${portal}-portal wrangler.jsonc vars.NEXT_PUBLIC_SUPABASE_STORAGE_KEY`,
      ).toBeTruthy();
      expect(NEXT_PUBLIC_SUPABASE_STORAGE_KEY).toBe(
        legacyDerivedStorageKey(NEXT_PUBLIC_SUPABASE_URL!),
      );
    });

    it(`${portal}-portal: staging vars — NEXT_PUBLIC_SUPABASE_STORAGE_KEY matches the URL-derived value`, () => {
      const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_STORAGE_KEY } =
        config.env?.staging?.vars ?? {};
      expect(
        NEXT_PUBLIC_SUPABASE_URL,
        `${portal}-portal wrangler.jsonc env.staging.vars.NEXT_PUBLIC_SUPABASE_URL`,
      ).toBeTruthy();
      expect(
        NEXT_PUBLIC_SUPABASE_STORAGE_KEY,
        `${portal}-portal wrangler.jsonc env.staging.vars.NEXT_PUBLIC_SUPABASE_STORAGE_KEY`,
      ).toBeTruthy();
      expect(NEXT_PUBLIC_SUPABASE_STORAGE_KEY).toBe(
        legacyDerivedStorageKey(NEXT_PUBLIC_SUPABASE_URL!),
      );
    });
  }

  it("prod pins are all the same canonical literal (all four portals share one Supabase project)", () => {
    for (const portal of PORTALS) {
      const config = readWranglerConfig(portal);
      expect(config.vars?.NEXT_PUBLIC_SUPABASE_STORAGE_KEY).toBe(
        "sb-bkvcixdmuyejfzcijpdg-auth-token",
      );
    }
  });

  it("staging pins are all the same canonical literal (staging is one separate Supabase project)", () => {
    for (const portal of PORTALS) {
      const config = readWranglerConfig(portal);
      expect(config.env?.staging?.vars?.NEXT_PUBLIC_SUPABASE_STORAGE_KEY).toBe(
        "sb-vuesoyhfrjabfxbrzekd-auth-token",
      );
    }
  });
});
