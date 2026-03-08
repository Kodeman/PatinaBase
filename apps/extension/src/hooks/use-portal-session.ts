import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, PORTAL_URL, getAuthCookieName } from '../lib/supabase';

interface PortalSessionResult {
  isChecking: boolean;
  found: boolean;
  error: string | null;
}

/**
 * Detects an existing portal session by reading the Supabase auth cookie
 * set on the portal domain. Also listens for real-time cookie changes
 * so the extension reacts when the user logs in/out of the portal.
 */
export function usePortalSession(): PortalSessionResult {
  const [isChecking, setIsChecking] = useState(true);
  const [found, setFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const cookieName = getAuthCookieName();

  const restoreSession = useCallback(async (cookieValue: string) => {
    try {
      const decoded = decodeURIComponent(cookieValue);
      const parsed = JSON.parse(decoded);

      if (!parsed.access_token || !parsed.refresh_token) {
        return false;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
      });

      if (sessionError) {
        console.error('Portal session restore failed:', sessionError.message);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }, []);

  // Initial cookie check on mount
  useEffect(() => {
    mountedRef.current = true;

    const checkCookie = async () => {
      try {
        const cookie = await chrome.cookies.get({
          url: PORTAL_URL,
          name: cookieName,
        });

        if (!mountedRef.current) return;

        if (cookie?.value) {
          const restored = await restoreSession(cookie.value);
          if (mountedRef.current) {
            setFound(restored);
          }
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
  }, [cookieName, restoreSession]);

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

      // Only care about our auth cookie on the portal domain
      if (cookie.name !== cookieName) return;
      if (!cookie.domain.endsWith(portalDomain) && !portalDomain.endsWith(cookie.domain.replace(/^\./, ''))) return;

      if (removed) {
        // Portal logged out — sign out extension too
        await supabase.auth.signOut();
        if (mountedRef.current) {
          setFound(false);
        }
      } else if (cookie.value) {
        // Portal logged in — restore session
        const restored = await restoreSession(cookie.value);
        if (mountedRef.current) {
          setFound(restored);
        }
      }
    };

    chrome.cookies.onChanged.addListener(handleCookieChange);
    return () => {
      chrome.cookies.onChanged.removeListener(handleCookieChange);
    };
  }, [cookieName, restoreSession]);

  return { isChecking, found, error };
}
