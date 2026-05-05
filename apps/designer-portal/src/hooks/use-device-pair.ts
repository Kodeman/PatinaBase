'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type PairState = 'idle' | 'loading' | 'pending' | 'consumed' | 'expired' | 'error';

interface PairResult {
  state: PairState;
  qrUrl: string | null;
  secondsRemaining: number;
  error: string | null;
  regenerate: () => void;
}

const POLL_INTERVAL_MS = 2000;

/**
 * Companion to `useQRAuth`. This hook drives the OTHER QR direction:
 * the portal user wants to sign a fresh iOS device in as themselves.
 *
 * Flow: POST /api/auth/device/pair → render QR → poll /status →
 * when consumed by iOS, surface success.
 */
export function useDevicePair(baseUrl = ''): PairResult {
  const [state, setState] = useState<PairState>('idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
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

  const generate = useCallback(async () => {
    cleanup();
    setState('loading');
    setError(null);
    setQrUrl(null);
    setNonce(null);

    try {
      const res = await fetch(`${baseUrl}/api/auth/device/pair`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (res.status === 401) {
        throw new Error('You must be signed in to pair a device.');
      }
      if (!res.ok) throw new Error('Failed to start pairing');

      const data = await res.json();
      if (!mountedRef.current) return;

      setNonce(data.nonce);
      setQrUrl(data.url);
      setExpiresAt(new Date(data.expiresAt));
      setState('pending');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to start pairing');
      setState('error');
    }
  }, [baseUrl, cleanup]);

  // Poll for status updates
  useEffect(() => {
    if (state !== 'pending' || !nonce) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `${baseUrl}/api/auth/device/status?nonce=${nonce}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!mountedRef.current) return;

        if (data.status === 'consumed') {
          cleanup();
          setState('consumed');
        } else if (data.status === 'expired' || data.status === 'denied') {
          cleanup();
          setState('expired');
        }
      } catch {
        // Ignore poll errors — try again next tick
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state, nonce, cleanup, baseUrl]);

  // Countdown
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
    generate();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [generate, cleanup]);

  return {
    state,
    qrUrl,
    secondsRemaining,
    error,
    regenerate: generate,
  };
}
