// Email asset host rewriting.
//
// A studio logo (and every other image an email builder emits) is stored in a
// Supabase public storage bucket, so its canonical URL names the project host —
// `https://<ref>.supabase.co/storage/v1/object/public/…`. Mailbox providers read
// that origin as a third-party file host and it costs deliverability, so email
// HTML serves the same bytes through Patina's own edge origin instead. The
// `patina-edge-api` Worker proxies `/storage/v1/` to the project verbatim, so
// only the origin changes; path and query are preserved byte-for-byte.
//
// This is an EMAIL-ONLY concern: studio-identity.ts keeps returning the raw
// storage URL, because PDFs and portal consumers want the canonical one.

const PUBLIC_OBJECT_PREFIX = "/storage/v1/object/public/";
const DEFAULT_ASSET_HOST = "https://api.patina.cloud";
// A mailbox provider's image proxy cannot reach a developer's machine, and the
// default asset host proxies the CLOUD project — rewriting a local URL onto it
// would serve some other project's bytes.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Env access may be denied (`deno test` without --allow-env); never throw. */
function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Rewrite a Supabase public-storage URL onto the email asset host.
 *
 * Rewritten only when the URL's origin EQUALS the configured Supabase project
 * origin (`supabaseUrl`, default `SUPABASE_URL`) AND its path is under
 * `/storage/v1/object/public/`. Another project's host — `*.supabase.co`
 * included — is someone else's storage and is left alone. A signed or otherwise
 * non-public storage path, a URL on any other host, and a non-absolute URL all
 * pass through unchanged. Null/empty input yields null.
 *
 * A local project origin (localhost/127.0.0.1/[::1]) is rewritten only when an
 * asset host was named explicitly (`assetHost` or `EMAIL_ASSET_HOST`).
 */
export function toEmailAssetUrl(
  url: string | null | undefined,
  opts: { supabaseUrl?: string; assetHost?: string } = {},
): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  if (!parsed.pathname.startsWith(PUBLIC_OBJECT_PREFIX)) return raw;

  const projectOrigin = originOf(opts.supabaseUrl ?? env("SUPABASE_URL"));
  if (projectOrigin === null || parsed.origin !== projectOrigin) return raw;

  const configuredHost = opts.assetHost ?? env("EMAIL_ASSET_HOST");
  if (!configuredHost && LOCAL_HOSTNAMES.has(parsed.hostname)) return raw;

  const assetOrigin = originOf(configuredHost ?? DEFAULT_ASSET_HOST);
  if (!assetOrigin) return raw;

  return `${assetOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Gmail (and several other clients) strip an `<img>` whose source is an SVG, so
 * a studio whose mark is a vector gets its name in type instead of a hole.
 */
export function isSvgAssetUrl(url: string | null | undefined): boolean {
  const raw = (url ?? "").trim();
  if (!raw) return false;
  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw.split(/[?#]/)[0];
  }
  return pathname.toLowerCase().endsWith(".svg");
}
