/**
 * @patina/auth/nextjs — Supabase Auth utilities for Next.js portals.
 *
 * This module is kept for backward compatibility.
 * New code should import directly from @patina/supabase/server.
 */

// Re-export the AuthSession type for backward compatibility
export interface AuthConfigOptions {
  defaultRole?: string;
  placeholderEmail?: string;
  signInCallback?: (params: { roles: string[] }) => boolean;
}

export type AppRole = string;

/**
 * @deprecated Use Supabase Auth directly. This stub exists for backward compatibility.
 */
export function createAuthConfig(_options: AuthConfigOptions = {}) {
  throw new Error(
    'createAuthConfig is deprecated. Auth is now handled by Supabase. ' +
    'Use @patina/supabase/server for server-side auth, or @patina/supabase hooks for client-side.'
  );
}
