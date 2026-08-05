'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import {
  normalizeAuthError,
  type AuthFailure,
} from '../auth/errors';

export type PortalQrAuthState =
  | 'idle'
  | 'loading'
  | 'pending'
  | 'verifying'
  | 'authenticated'
  | 'expired'
  | 'denied'
  | 'error';

export type PortalQrAuthFailure = AuthFailure;

export interface PortalQrAuthOptions {
  /** Empty string means the current portal owns the QR endpoints. */
  baseUrl: string;
  /** Usually tied to the QR disclosure's expanded state. */
  enabled: boolean;
}

export interface PortalQrAuthSnapshot {
  state: PortalQrAuthState;
  qrUrl: string | null;
  secondsRemaining: number;
  failure: PortalQrAuthFailure | null;
}

export interface PortalQrAuthResult extends PortalQrAuthSnapshot {
  start: () => Promise<void>;
  regenerate: () => Promise<void>;
}

interface GenerateResponse {
  sessionToken: string;
  qrUrl: string;
  expiresAt: string;
}

interface StatusResponse {
  status: 'pending' | 'approved' | 'expired' | 'denied';
  tokenHash?: string;
}

interface PortalQrControllerOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  getSupabase?: () => Pick<SupabaseClient<Database>, 'auth'>;
  now?: () => number;
  pollIntervalMs?: number;
  countdownIntervalMs?: number;
}

export interface PortalQrAuthController {
  getSnapshot(): PortalQrAuthSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  regenerate(): Promise<void>;
  stop(): void;
  dispose(): void;
}

const IDLE_SNAPSHOT: PortalQrAuthSnapshot = {
  state: 'idle',
  qrUrl: null,
  secondsRemaining: 0,
  failure: null,
};

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function isGenerateResponse(value: unknown): value is GenerateResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response.sessionToken === 'string' &&
    typeof response.qrUrl === 'string' &&
    typeof response.expiresAt === 'string'
  );
}

function isStatusResponse(value: unknown): value is StatusResponse {
  if (!value || typeof value !== 'object') return false;
  const status = (value as Record<string, unknown>).status;
  return ['pending', 'approved', 'expired', 'denied'].includes(String(status));
}

/**
 * Stateful QR engine kept separate from React so timer, retry, and teardown
 * behavior can be verified deterministically.
 */
export function createPortalQrAuthController({
  baseUrl,
  fetcher = fetch,
  getSupabase = createBrowserClient,
  now = Date.now,
  pollIntervalMs = 2_000,
  countdownIntervalMs = 1_000,
}: PortalQrControllerOptions): PortalQrAuthController {
  let snapshot: PortalQrAuthSnapshot = IDLE_SNAPSHOT;
  let sessionToken: string | null = null;
  let expiresAt = 0;
  let operation = 0;
  let disposed = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;
  let abortController: AbortController | undefined;
  const listeners = new Set<() => void>();

  const publish = (next: Partial<PortalQrAuthSnapshot>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };

  const clearWork = () => {
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    if (countdownTimer !== undefined) clearInterval(countdownTimer);
    pollTimer = undefined;
    countdownTimer = undefined;
    abortController?.abort();
    abortController = undefined;
  };

  const finish = (
    state: Extract<PortalQrAuthState, 'expired' | 'denied'>,
  ) => {
    clearWork();
    publish({ state, secondsRemaining: 0 });
  };

  const fail = (error: unknown) => {
    clearWork();
    publish({
      state: 'error',
      failure: normalizeAuthError(error, 'qr'),
    });
  };

  const updateCountdown = () => {
    const secondsRemaining = Math.max(
      0,
      Math.ceil((expiresAt - now()) / 1_000),
    );
    if (secondsRemaining <= 0) {
      finish('expired');
      return;
    }
    publish({ secondsRemaining });
  };

  const schedulePoll = (currentOperation: number) => {
    pollTimer = setTimeout(() => {
      void poll(currentOperation);
    }, pollIntervalMs);
  };

  const poll = async (currentOperation: number): Promise<void> => {
    if (
      disposed ||
      currentOperation !== operation ||
      snapshot.state !== 'pending' ||
      !sessionToken
    ) {
      return;
    }

    try {
      const response = await fetcher(
        endpoint(
          baseUrl,
          `/api/auth/qr/status?session=${encodeURIComponent(sessionToken)}`,
        ),
        { cache: 'no-store', signal: abortController?.signal },
      );
      if (disposed || currentOperation !== operation) return;

      // A transient status failure should not invalidate a QR session. Keep
      // polling until its local expiry gives the user a deterministic state.
      if (!response.ok) {
        schedulePoll(currentOperation);
        return;
      }

      const data: unknown = await response.json();
      if (!isStatusResponse(data)) {
        schedulePoll(currentOperation);
        return;
      }

      if (data.status === 'expired') {
        finish('expired');
        return;
      }
      if (data.status === 'denied') {
        finish('denied');
        return;
      }
      if (data.status === 'pending') {
        schedulePoll(currentOperation);
        return;
      }
      if (!data.tokenHash) {
        fail(new Error('Approved QR response was incomplete'));
        return;
      }

      if (pollTimer !== undefined) clearTimeout(pollTimer);
      if (countdownTimer !== undefined) clearInterval(countdownTimer);
      pollTimer = undefined;
      countdownTimer = undefined;
      publish({ state: 'verifying', failure: null });

      const supabase = getSupabase();
      const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: 'magiclink',
      });
      if (disposed || currentOperation !== operation) return;
      if (verifyError) {
        if (normalizeAuthError(verifyError).kind === 'invalid_code') {
          finish('expired');
          return;
        }
        fail(verifyError);
        return;
      }

      let authenticatedSession = verified.session;
      if (!authenticatedSession) {
        const { data: current, error: sessionError } =
          await supabase.auth.getSession();
        if (disposed || currentOperation !== operation) return;
        if (sessionError || !current.session) {
          fail(sessionError ?? new Error('No session after QR verification'));
          return;
        }
        authenticatedSession = current.session;
      }

      clearWork();
      publish({
        state: 'authenticated',
        secondsRemaining: 0,
        failure: null,
      });
    } catch (error) {
      if (disposed || currentOperation !== operation) return;
      if (abortController?.signal.aborted) return;
      if (snapshot.state === 'pending') {
        // Network interruptions during polling are retried while the code is
        // valid. Verification failures are surfaced rather than leaving the
        // UI stranded in its verifying state.
        schedulePoll(currentOperation);
      } else {
        fail(error);
      }
    }
  };

  const start = async (): Promise<void> => {
    clearWork();
    operation += 1;
    const currentOperation = operation;
    sessionToken = null;
    expiresAt = 0;
    abortController = new AbortController();
    publish({
      state: 'loading',
      qrUrl: null,
      secondsRemaining: 0,
      failure: null,
    });

    try {
      const response = await fetcher(
        endpoint(baseUrl, '/api/auth/qr/generate'),
        { cache: 'no-store', signal: abortController.signal },
      );
      if (disposed || currentOperation !== operation) return;
      if (!response.ok) {
        fail(new Error('QR generation failed'));
        return;
      }

      const data: unknown = await response.json();
      if (!isGenerateResponse(data)) {
        fail(new Error('QR generation response was incomplete'));
        return;
      }

      const parsedExpiry = Date.parse(data.expiresAt);
      if (!Number.isFinite(parsedExpiry) || parsedExpiry <= now()) {
        finish('expired');
        return;
      }

      sessionToken = data.sessionToken;
      expiresAt = parsedExpiry;
      publish({ state: 'pending', qrUrl: data.qrUrl, failure: null });
      updateCountdown();
      if (snapshot.state !== 'pending') return;
      countdownTimer = setInterval(updateCountdown, countdownIntervalMs);
      schedulePoll(currentOperation);
    } catch (error) {
      if (disposed || currentOperation !== operation) return;
      if (abortController.signal.aborted) return;
      fail(error);
    }
  };

  const stop = () => {
    operation += 1;
    clearWork();
    sessionToken = null;
    expiresAt = 0;
    publish(IDLE_SNAPSHOT);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    regenerate: start,
    stop,
    dispose() {
      if (disposed) return;
      operation += 1;
      clearWork();
      disposed = true;
      listeners.clear();
    },
  };
}

export function usePortalQrAuth({
  baseUrl,
  enabled,
}: PortalQrAuthOptions): PortalQrAuthResult {
  const controller = useMemo(
    () => createPortalQrAuthController({ baseUrl }),
    [baseUrl],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    if (enabled) void controller.start();
    else controller.stop();

    return () => controller.stop();
  }, [controller, enabled]);

  useEffect(() => () => controller.dispose(), [controller]);

  const start = useCallback(
    () => (enabled ? controller.start() : Promise.resolve()),
    [controller, enabled],
  );
  const regenerate = useCallback(
    () => (enabled ? controller.regenerate() : Promise.resolve()),
    [controller, enabled],
  );

  return { ...snapshot, start, regenerate };
}
