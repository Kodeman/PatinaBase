import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import {
  normalizeAuthError,
  type AuthFailure,
  type AuthFailureKind,
} from './errors';

export type AuthCallbackMethod =
  | 'recovery-token'
  | 'recovery-session'
  | 'pkce'
  | 'existing-session'
  | 'auth-state';

export type AuthCallbackResult =
  | {
      status: 'authenticated';
      session: Session;
      method: AuthCallbackMethod;
    }
  | {
      status: 'failed';
      failure: AuthFailure;
    };

export interface FinalizeAuthCallbackOptions {
  supabase: Pick<SupabaseClient<Database>, 'auth'>;
  code?: string | null;
  recovery?: boolean;
  recoveryTokenHash?: string | null;
  legacyRecoveryFragment?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function failed(error: unknown, fallback: AuthFailureKind): AuthCallbackResult {
  return { status: 'failed', failure: normalizeAuthError(error, fallback) };
}

/**
 * Complete an OAuth/email callback and confirm a real browser session.
 *
 * PKCE callbacks exchange `code` explicitly. Fragment callbacks (including
 * Apple) are parsed by supabase-js when the browser client initializes, so the
 * helper checks the current session and then briefly listens for SIGNED_IN.
 * It never performs navigation; the portal owns its success transition.
 */
export async function finalizeAuthCallback({
  supabase,
  code,
  recovery = false,
  recoveryTokenHash,
  legacyRecoveryFragment = false,
  timeoutMs = 5_000,
  signal,
}: FinalizeAuthCallbackOptions): Promise<AuthCallbackResult> {
  if (signal?.aborted) return failed(signal.reason, 'cancelled');
  const hasRecoveryToken =
    recoveryTokenHash !== undefined && recoveryTokenHash !== null;
  const isRecovery = recovery || hasRecoveryToken || legacyRecoveryFragment;
  const startedAt = Date.now();
  const remainingMs = () =>
    Math.max(0, timeoutMs - (Date.now() - startedAt));

  const awaitWithinDeadline = <T>(operation: PromiseLike<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let settled = false;
      let timerId: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timerId !== undefined) clearTimeout(timerId);
        signal?.removeEventListener('abort', handleAbort);
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const handleAbort = () =>
        finish(() => reject(signal?.reason ?? new Error('Auth callback aborted')));

      signal?.addEventListener('abort', handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      timerId = setTimeout(
        () => finish(() => reject(new Error('Auth callback timed out'))),
        remainingMs(),
      );
      Promise.resolve(operation).then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });

  const waitForAuthState = (
    recoveryOnly: boolean,
  ): Promise<AuthCallbackResult> =>
    new Promise<AuthCallbackResult>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let subscription: { unsubscribe(): void } | undefined;

      const cleanup = () => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        subscription?.unsubscribe();
        signal?.removeEventListener('abort', handleAbort);
      };
      const finish = (result: AuthCallbackResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };
      const handleAbort = () => finish(failed(signal?.reason, 'cancelled'));

      signal?.addEventListener('abort', handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }

      let authState: ReturnType<typeof supabase.auth.onAuthStateChange>;
      try {
        authState = supabase.auth.onAuthStateChange((event, nextSession) => {
          const accepted = recoveryOnly
            ? event === 'PASSWORD_RECOVERY'
            : event === 'SIGNED_IN' || event === 'INITIAL_SESSION';
          if (accepted && nextSession) {
            finish({
              status: 'authenticated',
              session: nextSession,
              method: recoveryOnly ? 'recovery-session' : 'auth-state',
            });
          }
        });
      } catch (error) {
        finish(failed(error, 'session'));
        return;
      }
      subscription = authState.data.subscription;

      if (settled) {
        subscription.unsubscribe();
        return;
      }

      timeoutId = setTimeout(
        () => finish(failed(new Error('Auth callback timed out'), 'timeout')),
        remainingMs(),
      );
    });

  try {
    if (hasRecoveryToken) {
      const { data, error } = await awaitWithinDeadline(
        supabase.auth.verifyOtp({
          token_hash: recoveryTokenHash,
          type: 'recovery',
        }),
      );
      if (signal?.aborted) return failed(signal.reason, 'cancelled');
      if (error) return failed(error, 'invalid_recovery');
      const recoverySession = data.session;
      if (!recoverySession) {
        return failed(new Error('Recovery session unavailable'), 'session');
      }

      const {
        data: { session: persistedSession },
        error: sessionError,
      } = await awaitWithinDeadline(supabase.auth.getSession());
      if (signal?.aborted) return failed(signal.reason, 'cancelled');
      if (sessionError || !persistedSession) {
        return failed(
          sessionError ?? new Error('Session unavailable'),
          'session',
        );
      }
      // An unrelated session must never make an invalid or partially persisted
      // recovery callback look successful. Confirm the session created by this
      // one-time token is the session now stored by the browser client.
      if (persistedSession.access_token !== recoverySession.access_token) {
        return failed(new Error('Recovery session mismatch'), 'session');
      }

      return {
        status: 'authenticated',
        session: recoverySession,
        method: 'recovery-token',
      };
    }

    if (legacyRecoveryFragment) {
      // A pre-TokenHash ConfirmationURL can still deliver implicit recovery
      // tokens. Do not trust a pre-existing session: only Supabase's dedicated
      // PASSWORD_RECOVERY event proves this fragment authorized a reset.
      return await waitForAuthState(true);
    }

    let exchangeFailure: AuthCallbackResult | null = null;
    if (code) {
      const { data, error } = await awaitWithinDeadline(
        supabase.auth.exchangeCodeForSession(code),
      );
      if (signal?.aborted) return failed(signal.reason, 'cancelled');
      if (error) {
        exchangeFailure = failed(
          error,
          isRecovery ? 'invalid_recovery' : 'oauth',
        );
        // A recovery code authorizes a password change. Never let response
        // data or an unrelated existing session mask a rejected credential.
        if (isRecovery) return exchangeFailure;
      }
      if (data.session) {
        return { status: 'authenticated', session: data.session, method: 'pkce' };
      }
    }

    if (isRecovery) {
      return failed(
        new Error('Recovery credential unavailable'),
        'invalid_recovery',
      );
    }

    const {
      data: { session },
      error,
    } = await awaitWithinDeadline(supabase.auth.getSession());
    if (signal?.aborted) return failed(signal.reason, 'cancelled');
    if (error) return failed(error, 'session');
    if (session) {
      return {
        status: 'authenticated',
        session,
        method: exchangeFailure
          ? 'existing-session'
          : code
            ? 'pkce'
            : 'existing-session',
      };
    }
    // A back-navigation or reload may revisit a callback whose one-time PKCE
    // code was already consumed successfully. Prefer the persisted session
    // above; without one, return the original exchange failure immediately.
    if (exchangeFailure) return exchangeFailure;

    return await waitForAuthState(false);
  } catch (error) {
    return failed(error, isRecovery ? 'invalid_recovery' : 'oauth');
  }
}
