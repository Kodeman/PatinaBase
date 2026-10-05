// Test-only fetch base for the deck resolver and web match (SQ-364).
//
// The e2e suite serves product pages (JSON-LD) and a Vision stand-in from a
// local fixture server. DECK_IMPORT_TEST_FETCH_BASE points the page fetches
// and the Vision call at it. It is honoured only on a local stack (SUPABASE_URL
// on 127.0.0.1, localhost, kong or host.docker.internal) and only for a
// loopback or docker-internal http base. Anywhere else it is ignored with one
// warning, so a stray value on a hosted project changes nothing.
//
// The rewrite lives in the transport, which fetchHtml calls AFTER
// assertSafeUrl and the DNS check on the ORIGINAL URL: the SSRF gate still
// judges the real host, and the redirect, byte-cap and content-type gates in
// fetchHtml still apply to the rewritten response.

import type { PinnedHttpTransport } from "../_shared/product-page/ssrf.ts";

const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "localhost", "kong", "host.docker.internal"]);
const LOCAL_BASE = /^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:\d{1,5})?\/?$/;

interface EnvReader {
  get(name: string): string | undefined;
}

let warned = false;

function warnOnce(warn: (message: string) => void, message: string): void {
  if (warned) return;
  warned = true;
  warn(message);
}

/** The fixture base to fetch through, or null (the normal path). Never throws. */
export function testFetchBase(env: EnvReader, warn: (message: string) => void = console.warn): string | null {
  const raw = env.get("DECK_IMPORT_TEST_FETCH_BASE");
  if (!raw) return null;
  let supabaseHost = "";
  try {
    supabaseHost = new URL(env.get("SUPABASE_URL") ?? "").hostname;
  } catch {
    supabaseHost = "";
  }
  if (!LOCAL_SUPABASE_HOSTS.has(supabaseHost)) {
    warnOnce(warn, "DECK_IMPORT_TEST_FETCH_BASE ignored: SUPABASE_URL is not a local stack");
    return null;
  }
  if (!LOCAL_BASE.test(raw)) {
    warnOnce(warn, "DECK_IMPORT_TEST_FETCH_BASE ignored: base must be a loopback or docker-internal http URL");
    return null;
  }
  return raw.replace(/\/$/, "");
}

/** https://www.rh.com/harbor-sofa?x=1 → <base>/www.rh.com/harbor-sofa?x=1 */
export function rewriteToBase(base: string, url: URL): string {
  return `${base}/${url.host}${url.pathname}${url.search}`;
}

/** A transport that sends each (already gated) hop to the fixture server. */
export function testTransport(base: string): PinnedHttpTransport {
  return {
    request: (url, _address, options) =>
      fetch(rewriteToBase(base, url), {
        headers: options.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
      }),
  };
}

/** Reset the one-time warning (tests only). */
export function resetTestFetchBaseWarning(): void {
  warned = false;
}
