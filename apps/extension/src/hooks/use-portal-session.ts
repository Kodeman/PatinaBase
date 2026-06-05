import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, PORTAL_URL, getAuthCookieName } from '../lib/supabase';
import { readPortalSessionTokens, isSessionCookieName } from '../lib/portal-cookie';

interface PortalSessionResult {
  isChecking: boolean;
  found: boolean;
  error: string | null;
}

/**
 * Detects an existing portal session by reading the Supabase auth cookie
 * set on the portal domain. Also listens for real-time cookie changes
 * so the extension reacts when the user logs in/out of the portal.
 *
 * The cookie is written by `@supabase/ssr` (base64-encoded and possibly
 * chunked across `<name>.0`, `.1`, …), so reading/decoding is handled by
 * `readPortalSessionTokens` rather than a naive `JSON.parse`.
 */
export function usePortalSession(): PortalSessionResult {
  const [isChecking, setIsChecking] = useState(true);
  const [found, setFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const cookieName = getAuthCookieName();

  // Read + decode the portal cookie(s) and adopt the session. Returns whether
  // a valid session was restored.
  const restoreFromPortal = useCallback(async () => {
    const tokens = await readPortalSessionTokens();
    if (!tokens) return false;

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    if (sessionError) {
      console.error('Portal session restore failed:', sessionError.message);
      return false;
    }

    return true;
  }, []);

  // Initial cookie check on mount
  useEffect(() => {
    mountedRef.current = true;

    const checkCookie = async () => {
      try {
        const restored = await restoreFromPortal();
        if (mountedRef.current) {
          setFound(restored);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Cookie access failed');
        }
      } finally {
        if (mountedRef.current) {
          setIsChecking(false);
        }
      }
    };

    checkCookie();

    return () => {
      mountedRef.current = false;
    };
  }, [restoreFromPortal]);

  // Listen for real-time cookie changes (portal login/logout)
  useEffect(() => {
    const portalDomain = (() => {
      try {
        return new URL(PORTAL_URL).hostname;
      } catch {
        return 'app.patina.cloud';
      }
    })();

    const handleCookieChange = async (changeInfo: chrome.cookies.CookieChangeInfo) => {
      const { cookie, removed } = changeInfo;

      // Care about the base auth cookie AND its chunks (`<name>.0`, `.1`, …),
      // on the portal domain. A chunked session never touches the base name,
      // so filtering on `cookie.name === cookieName` alone would miss logins.
      if (!isSessionCookieName(cookie.name, cookieName)) return;
      if (!cookie.domain.endsWith(portalDomain) && !portalDomain.endsWith(cookie.domain.replace(/^\./, ''))) return;

      if (removed) {
        // Portal logged out — sign out extension too. (Chunk rotation also
        // fires `removed` per chunk; signing out on a stale chunk is corrected
        // by the subsequent set events re-restoring the session below.)
        await supabase.auth.signOut();
        if (mountedRef.current) {
          setFound(false);
        }
      } else {
        // Portal cookie changed — re-read the full (re)combined cookie rather
        // than trusting this single chunk's value.
        const restored = await restoreFromPortal();
        if (mountedRef.current) {
          setFound(restored);
        }
      }
    };

    chrome.cookies.onChanged.addListener(handleCookieChange);
    return () => {
      chrome.cookies.onChanged.removeListener(handleCookieChange);
    };
  }, [cookieName, restoreFromPortal]);

  return { isChecking, found, error };
}
