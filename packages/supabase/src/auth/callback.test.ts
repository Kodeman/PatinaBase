import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../database.types';
import { finalizeAuthCallback } from './callback';

const session = { access_token: 'test-access-token' } as Session;

type AuthClient = Pick<SupabaseClient<Database>, 'auth'>;

function createAuthClient(overrides: Record<string, unknown> = {}) {
  const unsubscribe = vi.fn();
  let listener: ((event: string, session: Session | null) => void) | undefined;
  const auth = {
    verifyOtp: vi.fn().mockResolvedValue({
      data: { session },
      error: null,
    }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({
      data: { session },
      error: null,
    }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    onAuthStateChange: vi.fn((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
    ...overrides,
  };

  return {
    supabase: { auth } as unknown as AuthClient,
    auth,
    unsubscribe,
    emit(event: string, nextSession: Session | null) {
      listener?.(event, nextSession);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('finalizeAuthCallback', () => {
  it('verifies a recovery token and confirms that its session was persisted', async () => {
    const client = createAuthClient({
      getSession: vi.fn().mockResolvedValue({
        data: { session },
        error: null,
      }),
    });

    await expect(
      finalizeAuthCallback({
        supabase: client.supabase,
        code: 'legacy-code-is-ignored',
        recoveryTokenHash: 'one-time-token-hash',
      }),
    ).resolves.toEqual({
      status: 'authenticated',
      session,
      method: 'recovery-token',
    });
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'one-time-token-hash',
      type: 'recovery',
    });
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('fails a recovery token closed even when an unrelated session exists', async () => {
    const client = createAuthClient({
      verifyOtp: vi.fn().mockResolvedValue({
        data: { session: null },
        error: new Error('Token has expired'),
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session },
        error: null,
      }),
    });

    await expect(
      finalizeAuthCallback({
        supabase: client.supabase,
        recoveryTokenHash: 'expired-token-hash',
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'invalid_recovery' },
    });
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it('fails an invalid legacy recovery PKCE code closed despite an existing session', async () => {
    const client = createAuthClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        // Defensive: even inconsistent response data must not mask the error.
        data: { session },
        error: new Error('code already used'),
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session },
        error: null,
      }),
    });

    await expect(
      finalizeAuthCallback({
        supabase: client.supabase,
        code: 'invalid-recovery-code',
        recovery: true,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'invalid_recovery' },
    });
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it('preserves a valid legacy recovery PKCE callback', async () => {
    const client = createAuthClient();

    await expect(
      finalizeAuthCallback({
        supabase: client.supabase,
        code: 'valid-recovery-code',
        recovery: true,
      }),
    ).resolves.toEqual({
      status: 'authenticated',
      session,
      method: 'pkce',
    });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'valid-recovery-code',
    );
  });

  it('accepts only PASSWORD_RECOVERY for a legacy implicit recovery fragment', async () => {
    vi.useFakeTimers();
    const client = createAuthClient();
    let settled = false;
    const pending = finalizeAuthCallback({
      supabase: client.supabase,
      recovery: true,
      legacyRecoveryFragment: true,
      timeoutMs: 5_000,
    });
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);

    client.emit('INITIAL_SESSION', session);
    client.emit('SIGNED_IN', session);
    await Promise.resolve();
    expect(settled).toBe(false);

    client.emit('PASSWORD_RECOVERY', session);
    await expect(pending).resolves.toEqual({
      status: 'authenticated',
      session,
      method: 'recovery-session',
    });
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('fails a recovery callback without a credential closed', async () => {
    const client = createAuthClient({
      getSession: vi.fn().mockResolvedValue({
        data: { session },
        error: null,
      }),
    });

    await expect(
      finalizeAuthCallback({
        supabase: client.supabase,
        recovery: true,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'invalid_recovery' },
    });
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it('rejects a recovery session that was not persisted as the active session', async () => {
    const unrelatedSession = {
      ...session,
      access_token: 'unrelated-session',
    } as Session;
    const client = createAuthClient({
      getSession: vi.fn().mockResolvedValue({
        data: { session: unrelatedSession },
        error: null,
      }),
    });

    await expect(
      finalizeAuthCallback({
        supabase: client.supabase,
        recoveryTokenHash: 'one-time-token-hash',
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'session' },
    });
  });

  it('exchanges a PKCE code and returns the confirmed session without listening', async () => {
    const client = createAuthClient();
    const result = await finalizeAuthCallback({
      supabase: client.supabase,
      code: 'pkce-code',
    });

    expect(result).toEqual({ status: 'authenticated', session, method: 'pkce' });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
    expect(client.auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it('returns a friendly OAuth failure when PKCE exchange fails', async () => {
    const client = createAuthClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: new Error('provider_secret_error_123'),
      }),
    });

    await expect(
      finalizeAuthCallback({ supabase: client.supabase, code: 'bad-code' }),
    ).resolves.toEqual({
      status: 'failed',
      failure: {
        kind: 'oauth',
        message: 'That sign-in didn\'t finish. Try again, or use a code by email.',
        retryable: true,
      },
    });
  });

  it('accepts an existing session when a previously consumed PKCE code is revisited', async () => {
    const client = createAuthClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: new Error('code already used'),
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session },
        error: null,
      }),
    });

    await expect(
      finalizeAuthCallback({ supabase: client.supabase, code: 'used-code' }),
    ).resolves.toEqual({
      status: 'authenticated',
      session,
      method: 'existing-session',
    });
  });

  it('recognizes a fragment session already parsed by supabase-js', async () => {
    const client = createAuthClient({
      getSession: vi.fn().mockResolvedValue({
        data: { session },
        error: null,
      }),
    });

    await expect(
      finalizeAuthCallback({ supabase: client.supabase }),
    ).resolves.toEqual({
      status: 'authenticated',
      session,
      method: 'existing-session',
    });
    expect(client.auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it('waits for Apple fragment SIGNED_IN and clears listener and timeout', async () => {
    vi.useFakeTimers();
    const client = createAuthClient();
    const pending = finalizeAuthCallback({
      supabase: client.supabase,
      timeoutMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.getTimerCount()).toBe(1);
    client.emit('SIGNED_IN', session);

    await expect(pending).resolves.toEqual({
      status: 'authenticated',
      session,
      method: 'auth-state',
    });
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts a session-bearing INITIAL_SESSION race', async () => {
    vi.useFakeTimers();
    const client = createAuthClient();
    const pending = finalizeAuthCallback({
      supabase: client.supabase,
      timeoutMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    client.emit('INITIAL_SESSION', session);

    await expect(pending).resolves.toEqual({
      status: 'authenticated',
      session,
      method: 'auth-state',
    });
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('applies the callback deadline while PKCE exchange is still pending', async () => {
    vi.useFakeTimers();
    const client = createAuthClient({
      exchangeCodeForSession: vi.fn(
        () => new Promise(() => undefined),
      ),
    });
    const pending = finalizeAuthCallback({
      supabase: client.supabase,
      code: 'stalled-code',
      timeoutMs: 250,
    });
    await vi.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'timeout' },
    });
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it('times out with friendly copy and unsubscribes', async () => {
    vi.useFakeTimers();
    const client = createAuthClient();
    const pending = finalizeAuthCallback({
      supabase: client.supabase,
      timeoutMs: 250,
    });
    await vi.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'timeout' },
    });
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports effect cleanup through AbortSignal', async () => {
    vi.useFakeTimers();
    const client = createAuthClient();
    const abortController = new AbortController();
    const pending = finalizeAuthCallback({
      supabase: client.supabase,
      timeoutMs: 5_000,
      signal: abortController.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    abortController.abort();

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'cancelled' },
    });
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors cleanup that occurs while the initial session check is pending', async () => {
    let resolveSession:
      | ((value: { data: { session: null }; error: null }) => void)
      | undefined;
    const getSession = vi.fn(
      () =>
        new Promise<{ data: { session: null }; error: null }>((resolve) => {
          resolveSession = resolve;
        }),
    );
    const client = createAuthClient({ getSession });
    const abortController = new AbortController();
    const pending = finalizeAuthCallback({
      supabase: client.supabase,
      signal: abortController.signal,
    });
    abortController.abort();
    resolveSession?.({ data: { session: null }, error: null });

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'cancelled' },
    });
    expect(client.auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it('cleans up when cancellation occurs during listener registration', async () => {
    const abortController = new AbortController();
    const unsubscribe = vi.fn();
    const client = createAuthClient({
      onAuthStateChange: vi.fn(() => {
        abortController.abort();
        return { data: { subscription: { unsubscribe } } };
      }),
    });

    await expect(
      finalizeAuthCallback({
        supabase: client.supabase,
        signal: abortController.signal,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'cancelled' },
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
