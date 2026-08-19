import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Workstream D-B1 (docs/engineering/repoint-b0-audit.md §5): pins the
 * Supabase auth storage/cookie key so a future `NEXT_PUBLIC_SUPABASE_URL`
 * repoint (e.g. to api.patina.cloud, same underlying project) can't silently
 * rename the auth cookie — which would mass-log-out every session and break
 * the extension's independent re-derivation.
 *
 * `packages/supabase/src/client.ts` reads env vars at MODULE LOAD TIME (not
 * inside the exported functions), so every test here resets the module
 * registry and re-imports fresh after setting `process.env` — the only way
 * to exercise different env combinations against this module's top-level
 * consts.
 *
 * `@supabase/ssr` is mocked so we can assert on exactly what options each
 * constructor passes through, without needing a real Supabase project or
 * network access.
 */

const PROD_URL = "https://bkvcixdmuyejfzcijpdg.supabase.co";
const PROD_ANON_KEY = "prod-anon-key";

/** Same formula @supabase/ssr / @supabase/supabase-js use to derive the
 * DEFAULT storage key when no explicit `auth.storageKey` is passed:
 * `sb-<url-host-first-label>-auth-token`. This is the "legacy derivation"
 * the pinned constant must match for the CURRENT prod URL. */
function legacyDerivedStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

const mockCreateBrowserClient = vi.fn(
  (_url: string, _key: string, options?: unknown) => ({
    __fake: "browser-client",
    options,
  }),
);
const mockCreateServerClient = vi.fn(
  (_url: string, _key: string, options?: unknown) => ({
    __fake: "server-client",
    options,
  }),
);

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: unknown[]) =>
    (mockCreateBrowserClient as unknown as (...a: unknown[]) => unknown)(
      ...args,
    ),
  createServerClient: (...args: unknown[]) =>
    (mockCreateServerClient as unknown as (...a: unknown[]) => unknown)(
      ...args,
    ),
}));

const ORIGINAL_ENV = { ...process.env };

async function importFreshClientModule() {
  vi.resetModules();
  return import("../client");
}

describe("D-B1: pinned auth storage key", () => {
  beforeEach(() => {
    mockCreateBrowserClient.mockClear();
    mockCreateServerClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = PROD_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_STORAGE_KEY;
    // Force the Node test environment into the "browser" code path only
    // where a test explicitly opts in — default to server/no-window.
    // @ts-expect-error -- test-only global cleanup guard
    delete globalThis.window;
    // Clear the module-level singleton between tests
    delete globalThis.__supabaseBrowserClient;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    // @ts-expect-error -- test-only global cleanup guard
    delete globalThis.window;
    // Clear the module-level singleton between tests
    delete globalThis.__supabaseBrowserClient;
    vi.resetModules();
  });

  it("(a) the pinned constant equals the legacy URL-derived name for the current prod URL", async () => {
    const { SUPABASE_AUTH_STORAGE_KEY } = await importFreshClientModule();

    expect(SUPABASE_AUTH_STORAGE_KEY).toBe(
      "sb-bkvcixdmuyejfzcijpdg-auth-token",
    );
    expect(SUPABASE_AUTH_STORAGE_KEY).toBe(legacyDerivedStorageKey(PROD_URL));
  });

  it("(a) NEXT_PUBLIC_SUPABASE_STORAGE_KEY overrides the literal fallback", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_KEY = "sb-override-auth-token";

    const { SUPABASE_AUTH_STORAGE_KEY } = await importFreshClientModule();

    expect(SUPABASE_AUTH_STORAGE_KEY).toBe("sb-override-auth-token");
  });

  it("(b) createBrowserClient (SSR-fallback / no-window branch) passes the pinned key", async () => {
    const { createBrowserClient, SUPABASE_AUTH_STORAGE_KEY } =
      await importFreshClientModule();

    createBrowserClient();

    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    const options = mockCreateBrowserClient.mock.calls[0][2] as {
      auth?: { storageKey?: string };
    };
    expect(options.auth?.storageKey).toBe(SUPABASE_AUTH_STORAGE_KEY);
    expect(options.auth?.storageKey).toBe("sb-bkvcixdmuyejfzcijpdg-auth-token");
  });

  it("(b) createBrowserClient (browser/singleton branch) passes the pinned key", async () => {
    // @ts-expect-error -- minimal window shim to hit the browser branch
    globalThis.window = { location: { hostname: "app.patina.cloud" } };

    const { createBrowserClient, SUPABASE_AUTH_STORAGE_KEY } =
      await importFreshClientModule();

    createBrowserClient();

    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    const options = mockCreateBrowserClient.mock.calls[0][2] as {
      auth?: { storageKey?: string };
    };
    expect(options.auth?.storageKey).toBe(SUPABASE_AUTH_STORAGE_KEY);
  });

  it("(b) createMiddlewareClient passes the pinned key through to createServerClient", async () => {
    const { createMiddlewareClient, SUPABASE_AUTH_STORAGE_KEY } =
      await importFreshClientModule();

    const fakeRequest = {
      cookies: {
        get: () => undefined,
        getAll: () => [],
        set: () => undefined,
      },
      headers: { get: () => null },
    };
    const fakeResponse = { cookies: { set: () => undefined } };

    createMiddlewareClient(fakeRequest, fakeResponse);

    expect(mockCreateServerClient).toHaveBeenCalledTimes(1);
    const options = mockCreateServerClient.mock.calls[0][2] as {
      auth?: { storageKey?: string };
    };
    expect(options.auth?.storageKey).toBe(SUPABASE_AUTH_STORAGE_KEY);
    expect(options.auth?.storageKey).toBe("sb-bkvcixdmuyejfzcijpdg-auth-token");
  });
});
