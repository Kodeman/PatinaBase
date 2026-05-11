/**
 * Returns the cookie domain to apply to Supabase auth cookies based on the
 * current host. Returns `.patina.cloud` for any `*.patina.cloud` host (and the
 * apex `patina.cloud`), enabling shared auth across `app.patina.cloud`,
 * `admin.patina.cloud`, `client.patina.cloud`, and `supabase.patina.cloud`.
 *
 * Returns `undefined` for localhost, IP addresses, `.local` hostnames, or any
 * unrelated host — in which case the browser falls back to the default
 * host-only cookie scope. That keeps `localhost`-based development unaffected.
 *
 * Detection order:
 *  1. `host` argument (preferred — explicit and works for SSR/middleware)
 *  2. `window.location.hostname` in the browser
 *  3. `SUPABASE_COOKIE_DOMAIN` env var on the server (rare; explicit override)
 */
export function getCookieDomain(host?: string): string | undefined {
  // 1. Resolve the hostname we're operating against.
  const target =
    host ??
    (typeof window !== 'undefined'
      ? window.location.hostname
      : undefined);

  // 2. No host detected? Allow a server-side env override as last resort.
  if (!target) {
    if (typeof window === 'undefined' && process.env.SUPABASE_COOKIE_DOMAIN) {
      return process.env.SUPABASE_COOKIE_DOMAIN;
    }
    return undefined;
  }

  // 3. Localhost / IP / .local — keep host-only cookies for dev.
  if (
    target === 'localhost' ||
    target.endsWith('.local') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(target)
  ) {
    return undefined;
  }

  // 4. patina.cloud and any subdomain → share via the parent domain.
  if (target === 'patina.cloud' || target.endsWith('.patina.cloud')) {
    return '.patina.cloud';
  }

  // 5. Unrelated host — fall back to default host-only cookies.
  return undefined;
}
