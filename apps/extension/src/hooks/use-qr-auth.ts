import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, PORTAL_URL } from '../lib/supabase';

export type QRAuthState = 'idle' | 'loading' | 'pending' | 'approved' | 'expired' | 'error';

const POLL_INTERVAL_MS = 2000;

export interface QRAuthResult {
  state: QRAuthState;
  qrUrl: string | null;
  secondsRemaining: number;
  error: string | null;
  regenerate: () => void;
}

/**
 * QR auth hook adapted for the Chrome extension.
 * Uses absolute PORTAL_URL for fetch calls and relies on onAuthStateChange
 * instead of a page redirect after authentication.
 */
export function useQRAuth(): QRAuthResult {
  const [state, setState] = useState<QRAuthState>('idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const generateSession = useCallback(async () => {
    cleanup();
    setState('loading');
    setError(null);
    setQrUrl(null);
    setSessionToken(null);

    try {
      const res = await fetch(`${PORTAL_URL}/api/auth/qr/generate`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to generate QR session');

      const data = await res.json();
      if (!mountedRef.current) return;

      setSessionToken(data.sessionToken);
      setQrUrl(data.qrUrl);
      setExpiresAt(new Date(data.expiresAt));
      setState('pending');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to generate QR code');
      setState('error');
    }
  }, [cleanup]);

  // Poll for status updates
  useEffect(() => {
    if (state !== 'pending' || !sessionToken) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `${PORTAL_URL}/api/auth/qr/status?session=${sessionToken}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;

        const data = await res.json();
        if (!mountedRef.current) return;

        if (data.status === 'approved' && data.tokenHash && data.email) {
          cleanup();
          setState('approved');

          try {
            const { error: otpError } = await supabase.auth.verifyOtp({
              token_hash: data.tokenHash,
              type: 'magiclink',
            });

            if (otpError) {
              console.error('QR auth verifyOtp error:', otpError);
              setState('error');
              setError(otpError.message || 'Failed to complete sign-in');
            }
            // On success, onAuthStateChange in sidepanel will pick up the new session
          } catch (verifyErr) {
            console.error('QR auth verify exception:', verifyErr);
            setState('error');
            setError(
              verifyErr instanceof Error ? verifyErr.message : 'Failed to complete sign-in'
            );
          }
        } else if (data.status === 'expired') {
          cleanup();
          setState('expired');
        } else if (data.status === 'denied') {
          cleanup();
          setState('expired');
        }
      } catch {
        // Silently ignore poll network errors — retry next interval
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state, sessionToken, cleanup]);

  // Countdown timer
  useEffect(() => {
    if (state !== 'pending' || !expiresAt) return;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        cleanup();
        setState('expired');
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [state, expiresAt, cleanup]);

  // Auto-generate on mount
  useEffect(() => {
    mountedRef.current = true;
    generateSession();

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [generateSession, cleanup]);

  return {
    state,
    qrUrl,
    secondsRemaining,
    error,
    regenerate: generateSession,
  };
}
