import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient, createServerClient as createSSRServerClient } from '@supabase/ssr';
import type { Database } from './database.types';

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT FACTORY
// ═══════════════════════════════════════════════════════════════════════════

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser client - for client components (legacy, non-SSR)
 * Now delegates to createBrowserClient() in browser context to share the singleton
 */
export function createClient(): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    // In browser, use the SSR browser client singleton for consistent auth state
    return createBrowserClient() as SupabaseClient<Database>;
  }
  // Server-side, create a basic client
  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey);
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
  if (typeof window !== 'undefined') {
    if (!globalThis.__supabaseBrowserClient) {
      globalThis.__supabaseBrowserClient = createSSRBrowserClient<Database>(supabaseUrl, supabaseAnonKey) as unknown as SupabaseClient<Database>;
    }
    return globalThis.__supabaseBrowserClient;
  }
  // SSR fallback - create new instance (will be replaced on client)
  return createSSRBrowserClient<Database>(supabaseUrl, supabaseAnonKey) as unknown as SupabaseClient<Database>;
}

/**
 * Middleware client - for Next.js middleware
 * Handles cookie operations via request/response
 */
export function createMiddlewareClient(
  request: { cookies: { get: (name: string) => { name: string; value: string } | undefined; getAll: () => { name: string; value: string }[]; set: (name: string, value: string) => void } },
  response: { cookies: { set: (cookie: { name: string; value: string; [key: string]: unknown }) => void } }
) {
  return createSSRServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Set on request so downstream Route Handlers see refreshed tokens
          request.cookies.set(name, value);
          // Set on response so the browser stores refreshed tokens
          response.cookies.set({ name, value, ...options });
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
  const adminUrl = process.env.SUPABASE_INTERNAL_URL || supabaseUrl;
  return createSupabaseClient<Database>(adminUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Disable Next.js fetch caching for server-side admin operations
      fetch: (url: RequestInfo | URL, options?: RequestInit) =>
        fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

// Re-export for backwards compatibility
export { createAdminClient as createServerClient };
