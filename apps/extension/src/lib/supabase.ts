import { createClient } from "@supabase/supabase-js";
import { chromeStorageAdapter } from "./chrome-storage-adapter";

export const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!;
export const PORTAL_URL =
  process.env.PLASMO_PUBLIC_PORTAL_URL || "https://app.patina.cloud";

/**
 * Pinned auth cookie name (Workstream D-B1, docs/engineering/repoint-b0-audit.md §5).
 *
 * The portals derive this from `NEXT_PUBLIC_SUPABASE_URL`'s host by default —
 * see the matching pin in `packages/supabase/src/client.ts`. This extension
 * has its own, independent `PLASMO_PUBLIC_SUPABASE_URL` and used to re-derive
 * the same name from it in `getAuthCookieName()` below. If either URL is ever
 * repointed (e.g. to `api.patina.cloud`) without both sides changing in
 * lockstep, that re-derivation would silently start reading the wrong cookie
 * name and break portal-session pairing. Pinning it here to the CURRENT
 * derived value for prod (`bkvcixdmuyejfzcijpdg`) removes the URL dependency
 * entirely.
 */
export const SUPABASE_AUTH_STORAGE_KEY =
  process.env.PLASMO_PUBLIC_SUPABASE_STORAGE_KEY ||
  "sb-bkvcixdmuyejfzcijpdg-auth-token";

/**
 * Shared Supabase client singleton for the extension.
 *
 * Auth state is persisted via `chrome.storage.local` (see
 * chrome-storage-adapter.ts) so the sidepanel and the MV3 background
 * service worker share the same session.
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
 * The Supabase auth cookie name the portals use. Pinned — see
 * `SUPABASE_AUTH_STORAGE_KEY` above. No longer derived from `SUPABASE_URL`.
 */
export function getAuthCookieName(): string {
  return SUPABASE_AUTH_STORAGE_KEY;
}
