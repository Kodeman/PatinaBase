import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPortalQrAuthController } from '../use-portal-qr-auth';

const session = {
  access_token: 'qr-access-token',
  refresh_token: 'qr-refresh-token',
  user: { id: 'qr-user' },
} as Session;

function response(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
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

/** Answers generate and status by URL so tests can advance time freely. */
function qrFetcher(status: unknown = { status: 'pending' }, lifetimeMs = 60_000) {
  return vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes('/generate')
      ? generateResponse(lifetimeMs)
      : response(status),
  );
}

function callsTo(fetcher: ReturnType<typeof qrFetcher>, path: string): number {
  return fetcher.mock.calls.filter((call) => String(call[0]).includes(path))
    .length;
}

function authClient(verifyResult: { session: Session | null } = { session }) {
  return {
    auth: {
      verifyOtp: vi.fn().mockResolvedValue({ data: verifyResult, error: null }),
      setSession: vi.fn().mockResolvedValue({ data: verifyResult, error: null }),
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
      getVerifier: () => client as never,
    });

    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      state: 'pending',
      qrUrl: 'patina://auth/qr?session=session-secret',
      secondsRemaining: 60,
      totalSeconds: 60,
      failure: null,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://app.patina.cloud/api/auth/qr/generate',
      expect.objectContaining({
        body: '{}',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    );

    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getSnapshot().state).toBe('verifying');
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://app.patina.cloud/api/auth/qr/status',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: 'Bearer session-secret' },
      }),
    );
    expect(String(fetcher.mock.calls[1][0])).not.toContain('session-secret');
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
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'qr-access-token',
      refresh_token: 'qr-refresh-token',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('consumes approval in isolation and never commits after cancellation', async () => {
    let resolveVerification: ((value: unknown) => void) | undefined;
    const verifier = {
      auth: {
        verifyOtp: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveVerification = resolve;
            }),
        ),
      },
    };
    const persistent = authClient();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(generateResponse())
      .mockResolvedValueOnce(
        response({ status: 'approved', tokenHash: 'cancelled-token-hash' }),
      );
    const controller = createPortalQrAuthController({
      baseUrl: '',
      fetcher,
      getVerifier: () => verifier as never,
      getSupabase: () => persistent as never,
    });

    await controller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getSnapshot().state).toBe('verifying');
    controller.stop();

    resolveVerification?.({ data: { session }, error: null });
    await vi.advanceTimersByTimeAsync(0);

    expect(verifier.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(persistent.auth.setSession).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ state: 'idle' });
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

  it('does not verify or overwrite expiry when an in-flight status response arrives late', async () => {
    const client = authClient();
    let resolveStatus: ((value: Response) => void) | undefined;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(generateResponse(1_000))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveStatus = resolve;
          }),
      );
    const controller = createPortalQrAuthController({
      baseUrl: '',
      fetcher,
      getSupabase: () => client as never,
      getVerifier: () => client as never,
      pollIntervalMs: 500,
    });

    await controller.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(500);
    expect(controller.getSnapshot().state).toBe('expired');

    resolveStatus?.(
      response({ status: 'approved', tokenHash: 'late-token-hash' }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getSnapshot()).toMatchObject({
      state: 'expired',
      failure: null,
    });
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
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
      getVerifier: () => client as never,
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
      getVerifier: () => client as never,
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
      getVerifier: () => client as never,
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

  it('reports the server lifetime as totalSeconds and clears it on stop', async () => {
    const fetcher = qrFetcher({ status: 'pending' }, 300_000);
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });

    expect(controller.getSnapshot().totalSeconds).toBe(0);
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      state: 'pending',
      secondsRemaining: 300,
      totalSeconds: 300,
    });

    // The ring reads a fixed total while the digits fall.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(controller.getSnapshot()).toMatchObject({
      secondsRemaining: 180,
      totalSeconds: 300,
    });

    controller.stop();
    expect(controller.getSnapshot()).toMatchObject({
      state: 'idle',
      secondsRemaining: 0,
      totalSeconds: 0,
    });
  });

  it('classifies a rate-limited generate instead of blaming the QR', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ error: 'slow down' }, false, 429));
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });

    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      state: 'error',
      failure: {
        kind: 'rate_limit',
        message: 'Too many attempts were made just now. Wait a minute, then try again.',
        retryable: true,
      },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses polling while the countdown keeps running, then polls at once on resume', async () => {
    const fetcher = qrFetcher();
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });

    await controller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callsTo(fetcher, '/status')).toBe(1);

    controller.pausePolling();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callsTo(fetcher, '/status')).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({
      state: 'pending',
      secondsRemaining: 48,
    });

    controller.resumePolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(callsTo(fetcher, '/status')).toBe(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/auth/qr/status',
      expect.objectContaining({
        headers: { Authorization: 'Bearer session-secret' },
      }),
    );

    // Resume restores the normal cadence rather than a single shot.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callsTo(fetcher, '/status')).toBe(3);
  });

  it('never opens a second poll loop when a resume lands mid-request', async () => {
    let releaseStatus: (() => void) | undefined;
    let statusCalls = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/generate')) return generateResponse();
      statusCalls += 1;
      // Only the first status request is held open — long enough for a
      // pause/resume pair to land while it is in flight.
      if (statusCalls === 1) {
        await new Promise<void>((resolve) => {
          releaseStatus = resolve;
        });
      }
      return response({ status: 'pending' });
    });
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });

    await controller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callsTo(fetcher, '/status')).toBe(1);

    controller.pausePolling();
    controller.resumePolling();
    await vi.advanceTimersByTimeAsync(0);
    // The request already on the wire re-arms the loop when it lands; a resume
    // that fired its own would leave two loops racing on a limited endpoint.
    expect(callsTo(fetcher, '/status')).toBe(1);

    releaseStatus?.();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callsTo(fetcher, '/status')).toBe(2);
    // A doubled loop would show up here as two calls per interval.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callsTo(fetcher, '/status')).toBe(3);
  });

  it('parks a paused session at its local expiry without polling', async () => {
    const fetcher = qrFetcher();
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });

    await controller.start();
    controller.pausePolling();
    await vi.advanceTimersByTimeAsync(61_000);

    expect(callsTo(fetcher, '/status')).toBe(0);
    expect(controller.getSnapshot()).toMatchObject({
      state: 'expired',
      secondsRemaining: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops the paused flag on stop and refuses to resume after disposal', async () => {
    const fetcher = qrFetcher();
    const controller = createPortalQrAuthController({ baseUrl: '', fetcher });

    await controller.start();
    controller.pausePolling();
    controller.stop();
    expect(vi.getTimerCount()).toBe(0);

    // A fresh session must not inherit the previous pause.
    await controller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callsTo(fetcher, '/status')).toBe(1);

    controller.pausePolling();
    controller.dispose();
    controller.resumePolling();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callsTo(fetcher, '/status')).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
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
