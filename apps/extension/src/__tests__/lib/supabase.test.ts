import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Workstream D-B1 (docs/engineering/repoint-b0-audit.md §5): the extension
 * used to independently re-derive the portal's auth cookie name from
 * `PLASMO_PUBLIC_SUPABASE_URL` (`sb-<host-first-label>-auth-token`). If the
 * extension's URL and the portals' `NEXT_PUBLIC_SUPABASE_URL` ever drifted
 * out of lockstep (e.g. only the portals get repointed to api.patina.cloud),
 * that re-derivation would silently start reading the wrong cookie name and
 * break portal-session pairing. `getAuthCookieName()` now returns a pinned
 * constant instead.
 *
 * setup.ts stubs `PLASMO_PUBLIC_SUPABASE_URL = http://localhost:54321` —
 * proof the returned name no longer varies with that URL.
 */

const ORIGINAL_ENV = { ...process.env };

async function importFreshSupabaseModule() {
  vi.resetModules();
  return import("../../lib/supabase");
}

describe("D-B1: pinned auth cookie name (extension)", () => {
  beforeEach(() => {
    process.env.PLASMO_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    delete process.env.PLASMO_PUBLIC_SUPABASE_STORAGE_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("(c) getAuthCookieName() returns the pinned SUPABASE_AUTH_STORAGE_KEY constant", async () => {
    const { getAuthCookieName, SUPABASE_AUTH_STORAGE_KEY } =
      await importFreshSupabaseModule();

    expect(getAuthCookieName()).toBe(SUPABASE_AUTH_STORAGE_KEY);
    expect(getAuthCookieName()).toBe("sb-bkvcixdmuyejfzcijpdg-auth-token");
  });

  it("is independent of PLASMO_PUBLIC_SUPABASE_URL (no longer derived from it)", async () => {
    // Point the extension's Supabase URL somewhere entirely different from
    // the pinned prod ref — the returned cookie name must not move.
    process.env.PLASMO_PUBLIC_SUPABASE_URL =
      "https://totally-different-project.supabase.co";

    const { getAuthCookieName } = await importFreshSupabaseModule();

    expect(getAuthCookieName()).toBe("sb-bkvcixdmuyejfzcijpdg-auth-token");
  });

  it("PLASMO_PUBLIC_SUPABASE_STORAGE_KEY overrides the literal fallback", async () => {
    process.env.PLASMO_PUBLIC_SUPABASE_STORAGE_KEY = "sb-override-auth-token";

    const { getAuthCookieName, SUPABASE_AUTH_STORAGE_KEY } =
      await importFreshSupabaseModule();

    expect(SUPABASE_AUTH_STORAGE_KEY).toBe("sb-override-auth-token");
    expect(getAuthCookieName()).toBe("sb-override-auth-token");
  });
});
