import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient as createRealSupabaseClient } from "@supabase/supabase-js";
import { StorageClient } from "@supabase/storage-js";

/**
 * F6 (adversarial review, PR #34): every other pinStorageDirect() test in
 * client.test.ts exercises it against a MOCKED `@supabase/ssr` client (a
 * plain object literal with `headers`/`fetch`/`storage` fields shaped to
 * match what pinStorageDirect() expects). That's cheap and fast, but it
 * can't catch a drift in what a REAL `SupabaseClient` instance actually
 * looks like (e.g. if `@supabase/supabase-js` ever renames/relocates the
 * `headers`/`fetch`/`storage` instance fields pinStorageDirect() reaches
 * into).
 *
 * This test builds a REAL `SupabaseClient` via `@supabase/supabase-js`'s
 * own `createClient` (no mocking of `@supabase/ssr` needed — that's not
 * used here), runs it through the exported `pinStorageDirect()`, and
 * asserts against the real, resulting `StorageClient` instance:
 *   1. `.storage.url` is rewritten to the direct (build-time) host, not the
 *      client's own (runtime-repointed) construction URL.
 *   2. A real storage network call — captured by a stub `fetch` rather
 *      than hitting the network — carries the same bearer-token
 *      Authorization header the original client would have used, proving
 *      `pinStorageDirect()`'s reuse of the client's `headers`/`fetch`
 *      (rather than reconstructing auth from scratch) actually works.
 *
 * Uses the same env-var setup pattern as client.test.ts: reset modules and
 * re-import `../client` fresh so its module-scope consts pick up this
 * test's `process.env` values.
 */

const DIRECT_URL = "https://bkvcixdmuyejfzcijpdg.supabase.co";
const RUNTIME_ORIGIN = "https://api.patina.cloud";
const TEST_KEY = "test-anon-key";

const ORIGINAL_ENV = { ...process.env };

describe("F6: pinStorageDirect() against a REAL @supabase/supabase-js client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = DIRECT_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = TEST_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_STORAGE_KEY;
    // @ts-expect-error -- test-only global cleanup guard
    delete globalThis.window;
    delete globalThis.__PATINA_SUPABASE_ORIGIN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete globalThis.__PATINA_SUPABASE_ORIGIN;
  });

  it("repoints .storage.url to the direct host and preserves the Authorization header on a real storage call", async () => {
    // Simulate the flipped state: getSupabaseUrl() resolves to the runtime
    // (repointed) origin, while NEXT_PUBLIC_SUPABASE_URL stays the direct
    // build-time host.
    globalThis.__PATINA_SUPABASE_ORIGIN = RUNTIME_ORIGIN;

    const { pinStorageDirect } = await import("../client");

    const capturedRequests: Request[] = [];
    const capturingStub: typeof fetch = async (input, init) => {
      capturedRequests.push(new Request(input as string | URL, init));
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    // A REAL SupabaseClient, constructed directly against
    // @supabase/supabase-js — exactly the shape pinStorageDirect() must
    // keep working against, not a hand-shaped mock.
    const client = createRealSupabaseClient(RUNTIME_ORIGIN, TEST_KEY, {
      global: { fetch: capturingStub },
    });

    // `.url` is `protected` on StorageClient's base class — read it the
    // same way the mocked-client tests in client.test.ts do (`as unknown
    // as { url?: string }`), since this test intentionally reaches past
    // that protection to assert on the real client's actual state.
    const storageUrl = () =>
      (client.storage as unknown as { url?: string }).url;

    // Sanity: before the pin, the real client's own storage is built
    // against its OWN construction URL (the runtime origin) — this is
    // exactly the divergence pinStorageDirect() exists to correct.
    expect(storageUrl()).toBe(`${RUNTIME_ORIGIN}/storage/v1`);

    pinStorageDirect(client);

    expect(client.storage).toBeInstanceOf(StorageClient);
    expect(storageUrl()).toBe(`${DIRECT_URL}/storage/v1`);

    // Exercise a real storage call through the pinned client and inspect
    // what actually went out over (the stubbed) `fetch`.
    await client.storage.from("test-bucket").list();

    expect(capturedRequests.length).toBeGreaterThan(0);
    const storageRequest = capturedRequests.find((req) =>
      req.url.startsWith(`${DIRECT_URL}/storage/v1`),
    );
    expect(
      storageRequest,
      "expected a captured request against the pinned direct storage host",
    ).toBeDefined();
    expect(storageRequest!.headers.get("authorization")).toBe(
      `Bearer ${TEST_KEY}`,
    );
  });
});
