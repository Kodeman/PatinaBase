import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageClient } from "@supabase/storage-js";

/**
 * Workstream D-B1 (docs/engineering/repoint-b0-audit.md §5): pins the
 * Supabase auth storage/cookie key so a future `NEXT_PUBLIC_SUPABASE_URL`
 * repoint (e.g. to api.patina.cloud, same underlying project) can't silently
 * rename the auth cookie — which would mass-log-out every session and break
 * the extension's independent re-derivation.
 *
 * `packages/supabase/src/client.ts` reads most env vars at MODULE LOAD TIME
 * (not inside the exported functions), so every test here resets the module
 * registry and re-imports fresh after setting `process.env` — the only way
 * to exercise different env combinations against this module's top-level
 * consts. The Supabase ORIGIN is the one exception (Workstream D-B2, below):
 * it's resolved lazily by `getSupabaseUrl()` at client-construction time so
 * a runtime `globalThis.__PATINA_SUPABASE_ORIGIN` override (emitted by each
 * portal's root-layout head script) can win without a fresh module import.
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
    // D-F2 (storage-direct pin): the real SupabaseClient exposes these as
    // protected/public instance fields; the mock needs to carry them too so
    // pinStorageDirect() has something to read (headers/fetch) and rewire
    // (storage) — see the D-F2 describe block below.
    headers: { "x-test-header": "yes" },
    fetch: vi.fn(),
    storage: { __fake: "original-storage" },
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

describe("D-B2: runtime-resolved Supabase origin", () => {
  const RUNTIME_ORIGIN = "https://api.patina.cloud";

  beforeEach(() => {
    mockCreateBrowserClient.mockClear();
    mockCreateServerClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = PROD_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_STORAGE_KEY;
    // @ts-expect-error -- test-only global cleanup guard
    delete globalThis.window;
    delete globalThis.__supabaseBrowserClient;
    delete globalThis.__PATINA_SUPABASE_ORIGIN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    // @ts-expect-error -- test-only global cleanup guard
    delete globalThis.window;
    delete globalThis.__supabaseBrowserClient;
    delete globalThis.__PATINA_SUPABASE_ORIGIN;
    vi.resetModules();
  });

  it("falls back to the build-time NEXT_PUBLIC_SUPABASE_URL inline when the runtime global is absent (today's common case)", async () => {
    const { createMiddlewareClient } = await importFreshClientModule();

    createMiddlewareClient(
      {
        cookies: {
          get: () => undefined,
          getAll: () => [],
          set: () => undefined,
        },
        headers: { get: () => null },
      },
      { cookies: { set: () => undefined } },
    );

    expect(mockCreateServerClient).toHaveBeenCalledTimes(1);
    expect(mockCreateServerClient.mock.calls[0][0]).toBe(PROD_URL);
  });

  it("prefers globalThis.__PATINA_SUPABASE_ORIGIN over the build-time inline when both are present", async () => {
    globalThis.__PATINA_SUPABASE_ORIGIN = RUNTIME_ORIGIN;
    const { createMiddlewareClient } = await importFreshClientModule();

    createMiddlewareClient(
      {
        cookies: {
          get: () => undefined,
          getAll: () => [],
          set: () => undefined,
        },
        headers: { get: () => null },
      },
      { cookies: { set: () => undefined } },
    );

    expect(mockCreateServerClient).toHaveBeenCalledTimes(1);
    expect(mockCreateServerClient.mock.calls[0][0]).toBe(RUNTIME_ORIGIN);
  });

  it("resolves the global at client-construction time, not module-eval time — setting it AFTER import still wins", async () => {
    const { createBrowserClient } = await importFreshClientModule();

    // Module already imported above with no global set. A module-scope
    // const would have captured the build-time URL at that point and never
    // see this later assignment; the lazy getter must still pick it up.
    globalThis.__PATINA_SUPABASE_ORIGIN = RUNTIME_ORIGIN;

    createBrowserClient();

    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserClient.mock.calls[0][0]).toBe(RUNTIME_ORIGIN);
  });

  it("falls back when the global is present but empty-string (guards against a blank head-script env var)", async () => {
    globalThis.__PATINA_SUPABASE_ORIGIN = "";
    const { createBrowserClient } = await importFreshClientModule();

    createBrowserClient();

    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserClient.mock.calls[0][0]).toBe(PROD_URL);
  });

  it("client construction still works end-to-end when the global is absent (regression: today's default path)", async () => {
    const { createBrowserClient, createMiddlewareClient } =
      await importFreshClientModule();

    expect(() => createBrowserClient()).not.toThrow();
    expect(() =>
      createMiddlewareClient(
        {
          cookies: {
            get: () => undefined,
            getAll: () => [],
            set: () => undefined,
          },
          headers: { get: () => null },
        },
        { cookies: { set: () => undefined } },
      ),
    ).not.toThrow();

    expect(mockCreateBrowserClient.mock.calls[0][0]).toBe(PROD_URL);
    expect(mockCreateServerClient.mock.calls[0][0]).toBe(PROD_URL);
  });
});

describe("D-F2: storage pinned to the direct origin (storage-direct ruling)", () => {
  const RUNTIME_ORIGIN = "https://api.patina.cloud";

  beforeEach(() => {
    mockCreateBrowserClient.mockClear();
    mockCreateServerClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = PROD_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_STORAGE_KEY;
    // @ts-expect-error -- test-only global cleanup guard
    delete globalThis.window;
    delete globalThis.__supabaseBrowserClient;
    delete globalThis.__PATINA_SUPABASE_ORIGIN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    // @ts-expect-error -- test-only global cleanup guard
    delete globalThis.window;
    delete globalThis.__supabaseBrowserClient;
    delete globalThis.__PATINA_SUPABASE_ORIGIN;
    vi.resetModules();
  });

  it("flipped: repoints storage to the build-time (direct) Supabase host, not the runtime origin", async () => {
    globalThis.__PATINA_SUPABASE_ORIGIN = RUNTIME_ORIGIN;
    const { createBrowserClient } = await importFreshClientModule();

    const client = createBrowserClient() as unknown as {
      storage: { url?: string };
    };

    // The underlying @supabase/ssr constructor still receives the runtime
    // (repointed) origin for everything else (auth, postgrest, realtime) —
    // only .storage gets pinned back to the direct host.
    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserClient.mock.calls[0][0]).toBe(RUNTIME_ORIGIN);

    expect(client.storage).toBeInstanceOf(StorageClient);
    expect(client.storage.url).toBe(`${PROD_URL}/storage/v1`);
  });

  it("un-flipped: leaves storage exactly as constructed (pin is inert when the origin hasn't been repointed)", async () => {
    const { createBrowserClient } = await importFreshClientModule();

    const client = createBrowserClient() as unknown as { storage: unknown };

    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserClient.mock.calls[0][0]).toBe(PROD_URL);

    const originalReturnValue = mockCreateBrowserClient.mock.results[0]
      .value as { storage: unknown };
    expect(client.storage).toBe(originalReturnValue.storage);
  });

  // The two cases above only exercise the SSR-fallback (no-`window`) branch
  // of createBrowserClient() — production traffic always goes through the
  // browser/singleton branch (`typeof window !== "undefined"`), which is a
  // DIFFERENT code path (see the window shim pattern in the D-B1
  // "(browser/singleton branch)" case above). Duplicate both cases with
  // `globalThis.window` set so the actual production path is covered too.
  it("flipped (browser/singleton branch): repoints storage to the build-time (direct) Supabase host, not the runtime origin", async () => {
    // @ts-expect-error -- minimal window shim to hit the browser branch
    globalThis.window = { location: { hostname: "app.patina.cloud" } };
    globalThis.__PATINA_SUPABASE_ORIGIN = RUNTIME_ORIGIN;
    const { createBrowserClient } = await importFreshClientModule();

    const client = createBrowserClient() as unknown as {
      storage: { url?: string };
    };

    // The underlying @supabase/ssr constructor still receives the runtime
    // (repointed) origin for everything else (auth, postgrest, realtime) —
    // only .storage gets pinned back to the direct host.
    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserClient.mock.calls[0][0]).toBe(RUNTIME_ORIGIN);

    expect(client.storage).toBeInstanceOf(StorageClient);
    expect(client.storage.url).toBe(`${PROD_URL}/storage/v1`);
  });

  it("un-flipped (browser/singleton branch): leaves storage exactly as constructed (pin is inert when the origin hasn't been repointed)", async () => {
    // @ts-expect-error -- minimal window shim to hit the browser branch
    globalThis.window = { location: { hostname: "app.patina.cloud" } };
    const { createBrowserClient } = await importFreshClientModule();

    const client = createBrowserClient() as unknown as { storage: unknown };

    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserClient.mock.calls[0][0]).toBe(PROD_URL);

    const originalReturnValue = mockCreateBrowserClient.mock.results[0]
      .value as { storage: unknown };
    expect(client.storage).toBe(originalReturnValue.storage);
  });
});
