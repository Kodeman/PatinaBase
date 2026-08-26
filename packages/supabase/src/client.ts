import {
  createClient as createSupabaseClient,
  SupabaseClient,
} from "@supabase/supabase-js";
import {
  createBrowserClient as createSSRBrowserClient,
  createServerClient as createSSRServerClient,
} from "@supabase/ssr";
import { StorageClient } from "@supabase/storage-js";
import type { Database } from "./database.types";
import { getCookieDomain } from "./lib/cookie-domain";

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT FACTORY
// ═══════════════════════════════════════════════════════════════════════════

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Runtime-resolvable Supabase origin (Workstream D-B2,
 * docs/engineering/repoint-b0-audit.md).
 *
 * Each portal's root layout emits `globalThis.__PATINA_SUPABASE_ORIGIN` from
 * a `next/script` `beforeInteractive` inline script, read from a server-side
 * env var — guaranteed by Next's runtime to execute before hydration/app
 * interactivity, regardless of the client's construction path. That lets a
 * later repoint flip a var + redeploy the head script instead of rebuilding
 * every portal bundle (today, `NEXT_PUBLIC_SUPABASE_URL` is inlined into the
 * bundle at build time by `infra/deploy-portal.sh`, so a repoint = a
 * rebuild).
 *
 * This wave only makes the origin runtime-RESOLVABLE at today's value — no
 * value changes, no bucketing/rollout logic. That's a later gated cutover.
 */
declare global {
  // eslint-disable-next-line no-var
  var __PATINA_SUPABASE_ORIGIN: string | undefined;
}

/**
 * Resolves the Supabase origin. MUST be called at client-construction time,
 * never hoisted into a module-scope const — a module-scope const evaluates
 * once at bundle-eval time, before the head script above has a chance to run,
 * and would silently pin the build-time fallback forever (the white-screen
 * failure mode this getter exists to avoid).
 */
function getSupabaseUrl(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.__PATINA_SUPABASE_ORIGIN === "string" &&
    globalThis.__PATINA_SUPABASE_ORIGIN.length > 0
  ) {
    return globalThis.__PATINA_SUPABASE_ORIGIN;
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/**
 * Pins the browser client's Storage instance to the build-time (direct)
 * Supabase host, even when `getSupabaseUrl()` has been runtime-repointed to
 * a different origin (e.g. api.patina.cloud) — the F2 storage-direct ruling
 * (docs/engineering/repoint-b0-audit.md).
 *
 * Storage MUST stay on the direct host: the Workers edge enforces a 100MB
 * request-body cap that would break large uploads, and PDF viewers embed
 * signed URLs in an `<iframe>` under a CSP `frame-src` that allows only the
 * direct origin, not api.patina.cloud. `supabase-js` derives `.storage` from
 * the single client URL with no override hook, so this reaches in after
 * construction and swaps it for a `StorageClient` built against the
 * build-time URL instead — reusing the client's own `headers` and `fetch`
 * (the session-JWT-injecting `fetchWithAuth`) so auth keeps working and only
 * the base URL changes. `.storage` is a plain, non-readonly instance
 * property (not a getter) on `SupabaseClient`, so this reassignment is safe.
 *
 * Inert (no-op) when the origin hasn't been runtime-repointed — i.e. today,
 * before `SUPABASE_ORIGIN_RUNTIME` is set at deploy time.
 *
 * IMPORTANT: relies on `@supabase/storage-js`'s constructor and protected
 * field shapes staying identical to the copy `@supabase/supabase-js` bundles
 * internally — see the version-lock comment on the dependency in
 * package.json. Do not bump one without the other.
 *
 * Caveats:
 * - `new URL("storage/v1", buildTimeUrl)` assumes `buildTimeUrl` is a bare
 *   origin (no path). That's how `supabase-js` itself derives `storageUrl`
 *   internally, and it's true of every `NEXT_PUBLIC_SUPABASE_URL` value in
 *   every env today (always `https://<ref>.supabase.co`) — if that value
 *   ever carries a path, this join and the client's own internal one would
 *   diverge.
 * - This is deliberately wired into `createBrowserClient()` only — the ONE
 *   factory whose singleton actually gets read with a runtime-repointed
 *   origin in the browser. `createClient()`'s server branch, `createAdminClient()`,
 *   and `createEphemeralAuthClient()` never see `SUPABASE_ORIGIN_RUNTIME`
 *   today (`globalThis.__PATINA_SUPABASE_ORIGIN` is emitted client-side
 *   only). If a future change ever sets that global server-side too, those
 *   other factories would need the same pin.
 * - Does not forward a 4th (`StorageClientOptions`) arg to `new
 *   StorageClient(...)`: `SupabaseClient` accepts `options.storage` at
 *   construction but only uses it inline to build its OWN internal
 *   `this.storage` — it isn't retained as a readable instance field, so
 *   there is nothing on `client` for this function to read back and
 *   forward. Patina doesn't pass `options.storage` anywhere today, so this
 *   is inert either way; if that changes, the value would need to be
 *   threaded through explicitly (e.g. a module-level const shared by both
 *   call sites), not recovered from the constructed client.
 */
export function pinStorageDirect(client: SupabaseClient<Database>): void {
  const buildTimeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (getSupabaseUrl() === buildTimeUrl) return; // inert when un-flipped
  const i = client as unknown as {
    headers: Record<string, string>;
    fetch?: typeof fetch;
    storage: StorageClient;
  };
  i.storage = new StorageClient(
    new URL("storage/v1", buildTimeUrl).href,
    i.headers,
    i.fetch,
  );
}

/**
 * Pinned auth storage key (Workstream D-B1, docs/engineering/repoint-b0-audit.md §5).
 *
 * Without an explicit `storageKey`, `@supabase/ssr` derives the auth cookie
 * name from the Supabase project ref in `NEXT_PUBLIC_SUPABASE_URL`'s host
 * (`sb-<host-first-label>-auth-token`). If that URL is ever repointed to a
 * different host (e.g. `api.patina.cloud`) while the underlying Supabase
 * project stays the same, the derived key would silently change — logging
 * out every session cookie in the wild and breaking the extension's
 * independent re-derivation in `apps/extension/src/lib/supabase.ts`.
 *
 * The literal below is the CURRENT derived value for prod
 * (`bkvcixdmuyejfzcijpdg`), pinned so it stays constant across any future URL
 * change. Override via env for environments on a different Supabase project
 * (see each portal's `wrangler.jsonc` `staging` block).
 */
export const SUPABASE_AUTH_STORAGE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_KEY ||
  "sb-bkvcixdmuyejfzcijpdg-auth-token";

/**
 * Build the auth-cookie options based on the resolved cookie domain. When a
 * domain is set we're on a `*.patina.cloud` host, so layer in `secure: true`
 * (cookie must be transmitted over HTTPS) and explicit `sameSite: 'lax'` /
 * `path: '/'` so cross-subdomain GET navigation still flows.
 *
 * When no domain resolves (localhost, IPs, etc.) we return an empty object —
 * the browser will use host-only scope and HTTP without breaking dev.
 */
function buildAuthCookieOptions(host?: string) {
  const domain = getCookieDomain(host);
  if (!domain) return {};
  return {
    domain,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
  };
}

/**
 * Browser client - for client components (legacy, non-SSR)
 * Now delegates to createBrowserClient() in browser context to share the singleton
 */
export function createClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    // In browser, use the SSR browser client singleton for consistent auth state
    return createBrowserClient() as SupabaseClient<Database>;
  }
  // Server-side, create a basic client
  return createSupabaseClient<Database>(getSupabaseUrl(), supabaseAnonKey);
}

/**
 * Browser client with SSR support - for client components with auth
 * Uses cookies for session persistence
 * Global singleton pattern to prevent multiple GoTrueClient instances across module bundles
 */
declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowserClient: SupabaseClient<Database> | undefined;
}

export function createBrowserClient(): SupabaseClient<Database> {
  const cookieOptions = buildAuthCookieOptions();
  if (typeof window !== "undefined") {
    if (!globalThis.__supabaseBrowserClient) {
      // Pin BEFORE publishing to the global singleton — if pinStorageDirect
      // ever throws, an un-pinned client must never be cached and handed
      // back on every subsequent call.
      const client = createSSRBrowserClient<Database>(
        getSupabaseUrl(),
        supabaseAnonKey,
        {
          cookieOptions,
          auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
        },
      ) as unknown as SupabaseClient<Database>;
      pinStorageDirect(client);
      globalThis.__supabaseBrowserClient = client;
    }
    return globalThis.__supabaseBrowserClient;
  }
  // SSR fallback - create new instance (will be replaced on client). Inert
  // no-op below since globalThis.__PATINA_SUPABASE_ORIGIN is unset server-side.
  const ssrFallbackClient = createSSRBrowserClient<Database>(
    getSupabaseUrl(),
    supabaseAnonKey,
    {
      cookieOptions,
      auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
    },
  ) as unknown as SupabaseClient<Database>;
  pinStorageDirect(ssrFallbackClient);
  return ssrFallbackClient;
}

/**
 * Isolated browser auth client for validating one-time credentials before they
 * are allowed to replace the portal's persisted session.
 *
 * This client deliberately has no storage side effects. Callers must explicitly
 * commit an accepted session through the shared browser client after their
 * operation is still current.
 */
export function createEphemeralAuthClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(getSupabaseUrl(), supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

/**
 * Middleware client - for Next.js middleware
 * Handles cookie operations via request/response
 */
export function createMiddlewareClient(
  request: {
    cookies: {
      get: (name: string) => { name: string; value: string } | undefined;
      getAll: () => { name: string; value: string }[];
      set: (name: string, value: string) => void;
    };
    headers?: { get: (name: string) => string | null };
  },
  response: {
    cookies: {
      set: (cookie: {
        name: string;
        value: string;
        [key: string]: unknown;
      }) => void;
    };
  },
) {
  // Detect host so cookies can be scoped to `.patina.cloud` in production
  // while remaining host-only on localhost.
  // Prefer x-forwarded-host if set (e.g. behind a future reverse proxy that
  // rewrites the inbound Host header). The current cloudflared topology
  // preserves the original Host, so this falls back to `host` in production.
  const forwardedHost = request.headers?.get("x-forwarded-host") ?? undefined;
  const rawHost = request.headers?.get("host") ?? undefined;
  const host = forwardedHost ?? rawHost;
  // Strip an optional `:port` suffix so `localhost:3000` is recognised as
  // `localhost` and skipped, and `app.patina.cloud:443` matches our suffix.
  const hostname = host?.replace(/:\d+$/, "");
  const cookieOptions = buildAuthCookieOptions(hostname);

  return createSSRServerClient<Database>(getSupabaseUrl(), supabaseAnonKey, {
    cookieOptions,
    auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Set on request so downstream Route Handlers see refreshed tokens
          request.cookies.set(name, value);
          // Set on response so the browser stores refreshed tokens. Merge in
          // cookieOptions so the domain/secure flags reach the response.
          response.cookies.set({ name, value, ...cookieOptions, ...options });
        });
      },
    },
  });
}

/**
 * Server client with service role - for admin operations
 * Bypasses RLS - use with caution
 * Uses SUPABASE_INTERNAL_URL if set (for server-side calls when external URL is unavailable)
 */
export function createAdminClient(serviceRoleKey?: string) {
  const key = serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const adminUrl = process.env.SUPABASE_INTERNAL_URL || getSupabaseUrl();
  return createSupabaseClient<Database>(adminUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Disable Next.js fetch caching for server-side admin operations
      fetch: (url: RequestInfo | URL, options?: RequestInit) =>
        fetch(url, { ...options, cache: "no-store" }),
    },
  });
}

// Re-export for backwards compatibility
export { createAdminClient as createServerClient };
