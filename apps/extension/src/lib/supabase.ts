import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!;
export const PORTAL_URL = process.env.PLASMO_PUBLIC_PORTAL_URL || 'https://app.patina.cloud';

/**
 * Shared Supabase client singleton for the extension.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Derive the Supabase auth cookie name from the Supabase URL.
 * Matches the portal middleware logic: `sb-<hostname-first-part>-auth-token`
 */
export function getAuthCookieName(): string {
  try {
    const hostPart = new URL(SUPABASE_URL).hostname.split('.')[0];
    return `sb-${hostPart}-auth-token`;
  } catch {
    return 'sb-api-auth-token';
  }
}
