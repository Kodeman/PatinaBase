import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPortalQrAuthController } from '../use-portal-qr-auth';

const session = { access_token: 'qr-access-token' } as Session;

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function generateResponse(lifetimeMs = 60_000) {
  return response({
    sessionToken: 'session-secret',
    qrUrl: 'patina://auth/qr?session=session-secret',
    expiresAt: new Date(Date.now() + lifetimeMs).toISOString(),
  });
}

function authClient(verifyResult: { session: Session | null } = { session }) {
  return {
    auth: {
      verifyOtp: vi.fn().mockResolvedValue({ data: verifyResult, error: null }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: verifyResult.session },
        error: null,
      }),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPortalQrAuthController', () => {
  it('does no network work until explicitly started', () => {
    const fetcher = vi.fn();
    const controller = createPortalQrAuthController({
      baseUrl: 'https://app.patina.cloud',
      fetcher,
    });

    expect(controller.getSnapshot()).toMatchObject({ state: 'idle', qrUrl: null });
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('generates, polls, verifies the returned token hash, and authenticates', async () => {
    const client = authClient();
    let resolveVerification: ((value: unknown) => void) | undefined;
    client.auth.verifyOtp.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVerification = resolve;
        }) as never,
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(generateResponse())
      .mockResolvedValueOnce(
        response({ status: 'approved', tokenHash: 'one-time-token-hash' }),
      );
    const controller = createPortalQrAuthController({
      baseUrl: 'https://app.patina.cloud/',
      fetcher,
      getSupabase: () => client as never,
    });

    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      state: 'pending',
      qrUrl: 'patina://auth/qr?session=session-secret',
      secondsRemaining: 60,
      failure: null,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://app.patina.cloud/api/auth/qr/generate',
      expect.objectContaining({ cache: 'no-store' }),
    );

    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getSnapshot().state).toBe('verifying');
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'one-time-token-hash',
      type: 'magiclink',
    });

    resolveVerification?.({ data: { session }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot()).toMatchObject({
      state: 'authenticated',
      secondsRemaining: 0,
      failure: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('distinguishes denial from expiry', async () => {
    const deniedFetch = vi
      .fn()
      .mockResolvedValueOnce(generateResponse())
      .mockResolvedValueOnce(response({ status: 'denied' }));
    const denied = createPortalQrAuthController({ baseUrl: '', fetcher: deniedFetch });
    await denied.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(denied.getSnapshot().state).toBe('denied');

    const expiredFetch = vi.fn().mockResolvedValueOnce(generateResponse(2_500));
    const expired = createPortalQrAuthController({ baseUrl: '', fetcher: expiredFetch });
    await expired.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(expired.getSnapshot()).toMatchObject({
      state: 'expired',
      secondsRemaining: 0,
    });
  });

  it('retries transient polling failures while the QR remains valid', async () => {
    const client = authClient();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(generateResponse())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        response({ status: 'approved', tokenHash: 'retry-token-hash' }),
      );
    const controller = createPortalQrAuthController({
      baseUrl: '',
      fetcher,
      getSupabase: () => client as never,
    });

    await controller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getSnapshot().state).toBe('pending');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getSnapshot().state).toBe('authenticated');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('returns friendly failure data and never raw API text', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response('database secret detail', false));
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });

    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      state: 'error',
      failure: {
        kind: 'qr',
        message: 'We couldn\'t make a QR code. Refresh it, or use a code by email.',
      },
    });
    expect(controller.getSnapshot().failure?.message).not.toContain('database secret');
  });

  it('never strands a thrown verification request in the verifying state', async () => {
    const client = authClient();
    client.auth.verifyOtp.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(generateResponse())
      .mockResolvedValueOnce(
        response({ status: 'approved', tokenHash: 'one-time-token-hash' }),
      );
    const controller = createPortalQrAuthController({
      baseUrl: '',
      fetcher,
      getSupabase: () => client as never,
    });

    await controller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getSnapshot()).toMatchObject({
      state: 'error',
      failure: {
        kind: 'network',
        message:
          'We couldn\'t reach Patina just now. Check your connection and try again.',
      },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('treats an expired one-time verification token as an expired QR', async () => {
    const client = authClient();
    client.auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'otp_expired', message: 'raw token detail' },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(generateResponse())
      .mockResolvedValueOnce(
        response({ status: 'approved', tokenHash: 'expired-token-hash' }),
      );
    const controller = createPortalQrAuthController({
      baseUrl: '',
      fetcher,
      getSupabase: () => client as never,
    });

    await controller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getSnapshot()).toMatchObject({
      state: 'expired',
      failure: null,
    });
  });

  it('regenerates cleanly and ignores an older in-flight response', async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        response({
          sessionToken: 'new-session',
          qrUrl: 'patina://auth/qr?session=new-session',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      );
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });

    const first = controller.start();
    await controller.regenerate();
    resolveFirst?.(generateResponse());
    await first;

    expect(controller.getSnapshot()).toMatchObject({
      state: 'pending',
      qrUrl: 'patina://auth/qr?session=new-session',
    });
    expect(vi.getTimerCount()).toBe(2);
  });

  it('cleans timers and suppresses state updates after disposal', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(generateResponse());
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });
    const listener = vi.fn();
    controller.subscribe(listener);

    await controller.start();
    const beforeDispose = controller.getSnapshot();
    expect(vi.getTimerCount()).toBe(2);
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(65_000);

    expect(controller.getSnapshot()).toBe(beforeDispose);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
