'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createBrowserClient,
  createEphemeralAuthClient,
} from '../client';
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
  /** Synchronously invalidates any in-flight QR operation. */
  cancel: () => void;
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
  /** Persistent portal client used only after an isolated verification wins. */
  getSupabase?: () => Pick<SupabaseClient<Database>, 'auth'>;
  /** Non-persisting client that may safely consume a one-time QR token. */
  getVerifier?: () => Pick<SupabaseClient<Database>, 'auth'>;
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
  getVerifier = createEphemeralAuthClient,
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

  const isCurrentOperation = (
    currentOperation: number,
    expectedState: PortalQrAuthState,
  ) =>
    !disposed &&
    currentOperation === operation &&
    snapshot.state === expectedState;

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
        endpoint(baseUrl, '/api/auth/qr/status'),
        {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${sessionToken}` },
          signal: abortController?.signal,
        },
      );
      if (
        disposed ||
        currentOperation !== operation ||
        snapshot.state !== 'pending'
      ) {
        return;
      }

      // A transient status failure should not invalidate a QR session. Keep
      // polling until its local expiry gives the user a deterministic state.
      if (!response.ok) {
        schedulePoll(currentOperation);
        return;
      }

      const data: unknown = await response.json();
      if (
        disposed ||
        currentOperation !== operation ||
        snapshot.state !== 'pending'
      ) {
        return;
      }
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

      // Consuming a token on the shared browser client would immediately
      // persist its session. Verify in isolation first so a collapsed QR flow,
      // unmount, or competing sign-in method cannot overwrite the intended
      // account after this operation has been cancelled.
      const verifier = getVerifier();
      const { data: verified, error: verifyError } = await verifier.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: 'magiclink',
      });
      if (!isCurrentOperation(currentOperation, 'verifying')) {
        return;
      }
      if (verifyError) {
        if (normalizeAuthError(verifyError).kind === 'invalid_code') {
          finish('expired');
          return;
        }
        fail(verifyError);
        return;
      }

      if (!verified.session) {
        fail(new Error('No session after QR verification'));
        return;
      }

      // Recheck immediately before the only persistent side effect. JavaScript
      // runs this check and setSession invocation in the same turn; portal
      // methods synchronously call cancel() before starting another auth call.
      if (!isCurrentOperation(currentOperation, 'verifying')) {
        return;
      }
      const supabase = getSupabase();
      const { data: committed, error: commitError } =
        await supabase.auth.setSession({
          access_token: verified.session.access_token,
          refresh_token: verified.session.refresh_token,
        });
      if (disposed || currentOperation !== operation) return;
      if (commitError || !committed.session) {
        fail(commitError ?? new Error('QR session could not be saved'));
        return;
      }

      const { data: current, error: sessionError } =
        await supabase.auth.getSession();
      if (disposed || currentOperation !== operation) return;
      if (
        sessionError ||
        !current.session ||
        current.session.user.id !== verified.session.user.id
      ) {
        fail(sessionError ?? new Error('QR session was not confirmed'));
        return;
      }

      clearWork();
      publish({
        state: 'authenticated',
        secondsRemaining: 0,
        failure: null,
      });
    } catch (error) {
      if (disposed || currentOperation !== operation) return;
      if (snapshot.state === 'pending') {
        // Network interruptions during polling are retried while the code is
        // valid. Verification failures are surfaced rather than leaving the
        // UI stranded in its verifying state.
        schedulePoll(currentOperation);
      } else if (snapshot.state === 'verifying') {
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
        {
          body: '{}',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: abortController.signal,
        },
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

    // `stop` is intentionally reusable. React Strict Mode replays this
    // setup/cleanup pair with the same memoized controller; permanently
    // disposing here would make the replayed setup inert. On real unmount,
    // useSyncExternalStore unsubscribes and this cleanup cancels all work.
    return () => controller.stop();
  }, [controller, enabled]);

  const start = useCallback(
    () => (enabled ? controller.start() : Promise.resolve()),
    [controller, enabled],
  );
  const regenerate = useCallback(
    () => (enabled ? controller.regenerate() : Promise.resolve()),
    [controller, enabled],
  );
  const cancel = useCallback(() => controller.stop(), [controller]);

  return { ...snapshot, start, regenerate, cancel };
}
