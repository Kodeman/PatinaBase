// deno-lint-ignore-file no-import-prefix
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchHtml, UrlError } from "../_shared/product-page/ssrf.ts";
import { resetTestFetchBaseWarning, rewriteToBase, testFetchBase, testTransport } from "./test_fetch_base.ts";

function env(values: Record<string, string>) {
  return { get: (name: string) => values[name] };
}

function capture() {
  const lines: string[] = [];
  return { lines, warn: (line: string) => void lines.push(line) };
}

const BASE = "http://host.docker.internal:4599";

Deno.test("unset: the normal path, no warning", () => {
  resetTestFetchBaseWarning();
  const log = capture();
  assertEquals(testFetchBase(env({ SUPABASE_URL: "http://kong:8000" }), log.warn), null);
  assertEquals(log.lines, []);
});

Deno.test("a hosted project ignores it (no-op) and warns once", () => {
  resetTestFetchBaseWarning();
  const log = capture();
  const hosted = env({
    SUPABASE_URL: "https://bkvcixdmuyejfzcijpdg.supabase.co",
    DECK_IMPORT_TEST_FETCH_BASE: BASE,
  });
  assertEquals(testFetchBase(hosted, log.warn), null);
  assertEquals(testFetchBase(hosted, log.warn), null);
  assertEquals(log.lines.length, 1);
});

Deno.test("an unparseable or missing SUPABASE_URL is not local", () => {
  resetTestFetchBaseWarning();
  assertEquals(testFetchBase(env({ DECK_IMPORT_TEST_FETCH_BASE: BASE }), () => {}), null);
  assertEquals(testFetchBase(env({ SUPABASE_URL: "nope", DECK_IMPORT_TEST_FETCH_BASE: BASE }), () => {}), null);
});

Deno.test("a non-loopback base is rejected even on a local stack", () => {
  for (const base of [
    "https://host.docker.internal:4599",
    "http://fixtures.example.com",
    "http://10.0.0.5:4599",
    "http://127.0.0.1.evil.com",
    "http://localhost:4599/sub",
  ]) {
    resetTestFetchBaseWarning();
    assertEquals(testFetchBase(env({ SUPABASE_URL: "http://kong:8000", DECK_IMPORT_TEST_FETCH_BASE: base }), () => {}), null, base);
  }
});

Deno.test("a local stack with a loopback base is honoured", () => {
  for (const supabase of ["http://kong:8000", "http://127.0.0.1:54321", "http://localhost:54321", "http://host.docker.internal:54321"]) {
    assertEquals(
      testFetchBase(env({ SUPABASE_URL: supabase, DECK_IMPORT_TEST_FETCH_BASE: `${BASE}/` }), () => {}),
      BASE,
    );
  }
});

Deno.test("rewrite keeps host, path and query", () => {
  assertEquals(
    rewriteToBase(BASE, new URL("https://www.rh.com/harbor-sofa?x=1")),
    `${BASE}/www.rh.com/harbor-sofa?x=1`,
  );
});

const publicResolver = () => Promise.resolve([{ address: "93.184.216.34", family: 4 as const }]);

Deno.test("fetchHtml through the test transport: SSRF judges the original URL, gates still apply", async () => {
  const seen: string[] = [];
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, (req) => {
    const path = new URL(req.url).pathname;
    seen.push(path);
    if (path === "/www.rh.com/moved") {
      return new Response(null, { status: 302, headers: { location: "https://www.rh.com/harbor-sofa" } });
    }
    if (path === "/www.rh.com/json") {
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }
    return new Response("<html><title>Harbor</title></html>", { headers: { "content-type": "text/html" } });
  });
  try {
    const base = `http://127.0.0.1:${server.addr.port}`;
    const deps = { transport: testTransport(base), resolver: publicResolver };

    const page = await fetchHtml("https://www.rh.com/moved", deps);
    assert(page.html.includes("Harbor"));
    assertEquals(page.finalUrl, "https://www.rh.com/harbor-sofa");
    assertEquals(seen, ["/www.rh.com/moved", "/www.rh.com/harbor-sofa"]);

    // The content-type gate still applies to the rewritten response.
    await assertRejects(() => fetchHtml("https://www.rh.com/json", deps), UrlError, "not_html");

    // An unsafe ORIGINAL URL never reaches the transport.
    const before = seen.length;
    await assertRejects(() => fetchHtml("http://127.0.0.1/admin", deps), UrlError);
    await assertRejects(() => fetchHtml("file:///etc/passwd", deps), UrlError);
    assertEquals(seen.length, before);
  } finally {
    await server.shutdown();
  }
});
