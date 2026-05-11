import { createClient } from '@supabase/supabase-js';
import { chromeStorageAdapter } from './chrome-storage-adapter';

export const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!;
export const PORTAL_URL = process.env.PLASMO_PUBLIC_PORTAL_URL || 'https://app.patina.cloud';

/**
 * Shared Supabase client singleton for the extension.
 *
 * Auth state is persisted via `chrome.storage.local` (see
 * chrome-storage-adapter.ts) so the sidepanel and the MV3 background
 * service worker share the same session — `supabase.auth.getSession()`
 * in background.ts depends on this for the offline capture queue sync.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

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
