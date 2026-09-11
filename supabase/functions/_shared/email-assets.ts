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
 * Rewritten only when the URL's origin is the configured Supabase project
 * origin (`supabaseUrl`, default `SUPABASE_URL`) or any `*.supabase.co` host,
 * AND its path is under `/storage/v1/object/public/`. A signed or otherwise
 * non-public storage path, a URL on any other host, and a non-absolute URL all
 * pass through unchanged. Null/empty input yields null.
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
  const isProjectOrigin = projectOrigin !== null &&
    parsed.origin === projectOrigin;
  const isSupabaseCloud = parsed.protocol === "https:" &&
    parsed.hostname.endsWith(".supabase.co");
  if (!isProjectOrigin && !isSupabaseCloud) return raw;

  const assetOrigin = originOf(
    opts.assetHost ?? env("EMAIL_ASSET_HOST") ?? DEFAULT_ASSET_HOST,
  );
  if (!assetOrigin) return raw;

  return `${assetOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}
