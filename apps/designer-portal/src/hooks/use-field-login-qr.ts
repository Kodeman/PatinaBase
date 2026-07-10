'use client';

/**
 * useFieldLoginQr — drives the "Connect Patina Field" QR handoff.
 *
 * Calls the `field-login-token` edge function (which mints a single-use GoTrue
 * magiclink token for the signed-in designer's OWN identity), builds the frozen
 * QR payload `field://login?v=1&th=<token_hash>`, and rotates it every 60s. Each
 * invoke supersedes the previous one-time token, so the on-screen QR is always
 * the freshest.
 *
 * SECURITY: the token_hash is a secret. It is NEVER logged — no console/analytics
 * call in this hook (or the modal) receives the token or the built URL.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@patina/supabase';

export const QR_ROTATE_SECONDS = 60;
export const FIELD_LOGIN_QR_VERSION = 1;

/** Build the frozen QR payload. Pure — safe to unit-test without any mocks. */
export function buildFieldLoginUrl(tokenHash: string): string {
  const params = new URLSearchParams({
    v: String(FIELD_LOGIN_QR_VERSION),
    th: tokenHash,
  });
  return `field://login?${params.toString()}`;
}

export type FieldLoginQrStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FieldLoginQrState {
  status: FieldLoginQrStatus;
  /** The `field://login?...` value to encode, or null when not ready. */
  qrValue: string | null;
  /** Seconds until the next automatic rotation (60 → 0). */
  secondsRemaining: number;
  error: string | null;
  /** Manual retry / regenerate. */
  refresh: () => void;
}

const GENERIC_ERROR = 'Could not create a connection code. Check your connection and try again.';

export function useFieldLoginQr(enabled: boolean): FieldLoginQrState {
  const [status, setStatus] = useState<FieldLoginQrStatus>('idle');
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(QR_ROTATE_SECONDS);
  const [error, setError] = useState<string | null>(null);

  // Monotonic id so a slow in-flight request can't clobber a newer one; also
  // used to invalidate the in-flight request when the modal closes.
  const requestIdRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const fetchToken = useCallback(async () => {
    const myId = ++requestIdRef.current;
    try {
      const supabase = createBrowserClient();
      // Empty body — the function reads NO parameters (it mints only for the
      // caller). The body just guarantees a POST.
      const { data, error: invokeError } = await supabase.functions.invoke(
        'field-login-token',
        { body: {} },
      );
      if (myId !== requestIdRef.current || !enabledRef.current) return; // superseded / closed
      if (invokeError || !data?.token_hash) {
        setStatus('error');
        setError(GENERIC_ERROR);
        setQrValue(null);
        return;
      }
      setQrValue(buildFieldLoginUrl(data.token_hash));
      setSecondsRemaining(QR_ROTATE_SECONDS);
      setError(null);
      setStatus('ready');
    } catch {
      // Deliberately swallow the error object — it may echo request detail.
      if (myId !== requestIdRef.current || !enabledRef.current) return;
      setStatus('error');
      setError(GENERIC_ERROR);
      setQrValue(null);
    }
  }, []);

  // Start on open; reset on close.
  useEffect(() => {
    if (!enabled) {
      requestIdRef.current++; // invalidate anything in flight
      setStatus('idle');
      setQrValue(null);
      setError(null);
      setSecondsRemaining(QR_ROTATE_SECONDS);
      return;
    }
    setStatus('loading');
    void fetchToken();
  }, [enabled, fetchToken]);

  // One-second countdown while a QR is on screen; stops at 0.
  useEffect(() => {
    if (!enabled || status !== 'ready' || secondsRemaining <= 0) return;
    const id = setTimeout(() => setSecondsRemaining((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [enabled, status, secondsRemaining]);

  // Rotate exactly once when the countdown reaches 0 (side effect kept out of
  // the state updater so StrictMode double-invoke can't double-fetch).
  useEffect(() => {
    if (enabled && status === 'ready' && secondsRemaining === 0) {
      void fetchToken();
    }
  }, [enabled, status, secondsRemaining, fetchToken]);

  const refresh = useCallback(() => {
    if (!enabledRef.current) return;
    setStatus('loading');
    void fetchToken();
  }, [fetchToken]);

  return { status, qrValue, secondsRemaining, error, refresh };
}
