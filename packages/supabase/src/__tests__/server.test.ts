import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Workstream D-B1 fix F1 (adversarial review of docs/engineering/repoint-b0-audit.md
 * §5): `packages/supabase/src/server.ts`'s `createServerClient()` is the fifth
 * site that calls a `@supabase/ssr` constructor — it was missed in the
 * original D-B1 pass despite 164 importing files. Without an explicit
 * `auth.storageKey`, it would derive the cookie name from
 * `NEXT_PUBLIC_SUPABASE_URL`'s host exactly like the three sites already
 * pinned in `client.ts`, so a future URL repoint would silently break every
 * Server Component / Route Handler that reads the session through this path.
 *
 * Same test strategy as `client.test.ts`: `@supabase/ssr` and `next/headers`
 * are mocked so we can assert on exactly what options are passed, and the
 * module is freshly re-imported per test (via `vi.resetModules()`) because
 * `server.ts` reads `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` at module load
 * time, not inside the exported functions.
 */

const PROD_URL = "https://bkvcixdmuyejfzcijpdg.supabase.co";
const PROD_ANON_KEY = "prod-anon-key";

const mockCreateServerClient = vi.fn(
  (_url: string, _key: string, options?: unknown) => ({
    __fake: "server-client",
    options,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
    },
  }),
);

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) =>
    (mockCreateServerClient as unknown as (...a: unknown[]) => unknown)(
      ...args,
    ),
}));

const mockCookiesGetAll = vi.fn(() => [] as { name: string; value: string }[]);
const mockHeadersGet = vi.fn(() => null as string | null);

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: mockCookiesGetAll,
    set: vi.fn(),
  }),
  headers: async () => ({
    get: mockHeadersGet,
  }),
}));

const ORIGINAL_ENV = { ...process.env };

async function importFreshServerModule() {
  vi.resetModules();
  return import("../server");
}

describe("D-B1 F1: pinned auth storage key in server.ts", () => {
  beforeEach(() => {
    mockCreateServerClient.mockClear();
    mockCookiesGetAll.mockClear();
    mockHeadersGet.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = PROD_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_STORAGE_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("createServerClient() passes the pinned SUPABASE_AUTH_STORAGE_KEY through to @supabase/ssr", async () => {
    const { createServerClient } = await importFreshServerModule();
    const { SUPABASE_AUTH_STORAGE_KEY } = await import("../client");

    await createServerClient();

    expect(mockCreateServerClient).toHaveBeenCalledTimes(1);
    const options = mockCreateServerClient.mock.calls[0][2] as {
      auth?: { storageKey?: string };
    };
    expect(options.auth?.storageKey).toBe(SUPABASE_AUTH_STORAGE_KEY);
    expect(options.auth?.storageKey).toBe("sb-bkvcixdmuyejfzcijpdg-auth-token");
  });

  it("is independent of NEXT_PUBLIC_SUPABASE_URL — no longer derives storageKey from it", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://totally-different-project.supabase.co";

    const { createServerClient } = await importFreshServerModule();

    await createServerClient();

    const options = mockCreateServerClient.mock.calls[0][2] as {
      auth?: { storageKey?: string };
    };
    expect(options.auth?.storageKey).toBe("sb-bkvcixdmuyejfzcijpdg-auth-token");
  });

  it("NEXT_PUBLIC_SUPABASE_STORAGE_KEY overrides the literal fallback", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_KEY = "sb-override-auth-token";

    const { createServerClient } = await importFreshServerModule();

    await createServerClient();

    const options = mockCreateServerClient.mock.calls[0][2] as {
      auth?: { storageKey?: string };
    };
    expect(options.auth?.storageKey).toBe("sb-override-auth-token");
  });

  it("getUser()/getSession() go through the same pinned createServerClient()", async () => {
    const { getUser, getSession } = await importFreshServerModule();

    await getUser();
    await getSession();

    expect(mockCreateServerClient).toHaveBeenCalledTimes(2);
    for (const call of mockCreateServerClient.mock.calls) {
      const options = call[2] as { auth?: { storageKey?: string } };
      expect(options.auth?.storageKey).toBe(
        "sb-bkvcixdmuyejfzcijpdg-auth-token",
      );
    }
  });
});
