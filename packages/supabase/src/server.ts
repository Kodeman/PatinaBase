/**
 * Supabase server-side utilities for Next.js portals.
 * Provides authenticated server client creation via cookies.
 */
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import type { Database } from './database.types';
import { getCookieDomain } from './lib/cookie-domain';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Resolve the cookie-options to apply when this server client writes session
 * cookies. We need to scope to `.patina.cloud` on production subdomains so
 * the session is shared with the other portals, but leave host-only behavior
 * on localhost. See `lib/cookie-domain.ts` for the decision logic.
 */
async function resolveServerCookieOptions() {
  let host: string | undefined;
  try {
    const headerStore = await headers();
    host =
      headerStore.get('x-forwarded-host') ??
      headerStore.get('host') ??
      undefined;
    host = host?.replace(/:\d+$/, '');
  } catch {
    // `headers()` isn't available in some contexts (e.g. static rendering).
    // Fall back to env-var / window detection inside getCookieDomain().
  }
  const domain = getCookieDomain(host);
  if (!domain) return {};
  return {
    domain,
    sameSite: 'lax' as const,
    secure: true,
    path: '/',
  };
}

/**
 * Create a Supabase client with the service role key. Bypasses RLS — use
 * only in trusted server contexts (API routes, server actions, cron jobs).
 *
 * Useful for flows that must act on a user's row without an active session,
 * e.g. public unsubscribe tokens or webhook processors.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — cannot create service client',
    );
  }
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create a Supabase server client for use in Server Components and Route Handlers.
 * Reads auth session from cookies automatically.
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  const cookieOptions = await resolveServerCookieOptions();

  return createSSRServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            // Merge cookieOptions defensively so domain/secure flags are
            // always applied — even if a caller passes per-cookie overrides.
            cookieStore.set(name, value, { ...cookieOptions, ...options } as any)
          );
        } catch {
          // setAll can throw in Server Components (read-only cookies)
          // This is expected — the session will still be refreshed on the next request
        }
      },
    },
  });
}

/**
 * Get the current authenticated user from Supabase.
 * Returns null if not authenticated.
 */
export async function getUser() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Get the current session (includes access token).
 * Returns null if not authenticated.
 */
export async function getSession() {
  const supabase = await createServerClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}
