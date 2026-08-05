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
        message: 'Apple sign-in didn\'t finish. Try again, or use a code by email.',
        retryable: true,
      },
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
});
