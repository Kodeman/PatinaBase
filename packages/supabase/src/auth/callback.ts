import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import {
  normalizeAuthError,
  type AuthFailure,
  type AuthFailureKind,
} from './errors';

export type AuthCallbackMethod = 'pkce' | 'existing-session' | 'auth-state';

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
  timeoutMs = 5_000,
  signal,
}: FinalizeAuthCallbackOptions): Promise<AuthCallbackResult> {
  if (signal?.aborted) return failed(signal.reason, 'cancelled');

  try {
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (signal?.aborted) return failed(signal.reason, 'cancelled');
      if (error) return failed(error, 'oauth');
      if (data.session) {
        return { status: 'authenticated', session: data.session, method: 'pkce' };
      }
    }

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (signal?.aborted) return failed(signal.reason, 'cancelled');
    if (error) return failed(error, 'session');
    if (session) {
      return {
        status: 'authenticated',
        session,
        method: code ? 'pkce' : 'existing-session',
      };
    }

    return await new Promise<AuthCallbackResult>((resolve) => {
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

      const authState = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'SIGNED_IN' && nextSession) {
          finish({
            status: 'authenticated',
            session: nextSession,
            method: 'auth-state',
          });
        }
      });
      subscription = authState.data.subscription;

      // Some test doubles and alternate clients may synchronously deliver the
      // current state while registering the listener.
      if (settled) {
        subscription.unsubscribe();
        return;
      }

      signal?.addEventListener('abort', handleAbort, { once: true });
      timeoutId = setTimeout(
        () => finish(failed(new Error('Auth callback timed out'), 'timeout')),
        timeoutMs,
      );
    });
  } catch (error) {
    return failed(error, 'oauth');
  }
}
