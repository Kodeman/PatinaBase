import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retryRequest,
  getTimeoutForMethod,
  createTimeoutSignal,
  fetchWithTimeout,
  RetryExhaustedError,
  TimeoutError,
  type RetryContext,
} from '../retry';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const ctx = (method = 'GET'): RetryContext => ({
  method,
  url: 'https://api.example/test',
  requestId: 'req-123',
});

describe('retryRequest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately on success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryRequest(fn, {}, ctx());
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a retryable HTTP status and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce('recovered');

    const promise = retryRequest(fn, { initialDelay: 10 }, ctx());
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws RetryExhaustedError when maxRetries is exceeded', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    const promise = retryRequest(fn, { maxRetries: 2, initialDelay: 10 }, ctx());
    // Attach assertion before flushing timers so the rejection is handled in order
    const assertion = expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('rethrows non-retryable HTTP errors immediately', async () => {
    const err = { status: 400, message: 'bad request' };
    const fn = vi.fn().mockRejectedValue(err);
    await expect(retryRequest(fn, {}, ctx())).rejects.toEqual(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('never retries 501 Not Implemented', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 501 });
    await expect(retryRequest(fn, {}, ctx())).rejects.toEqual({ status: 501 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable network error codes', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
      .mockResolvedValueOnce('ok');

    const promise = retryRequest(fn, { initialDelay: 10 }, ctx());
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
  });

  it('does not retry mutations by default', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(retryRequest(fn, {}, ctx('POST'))).rejects.toEqual({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does retry mutations when shouldRetryMutation is true', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce('committed');

    const promise = retryRequest(
      fn,
      { shouldRetryMutation: true, initialDelay: 10 },
      ctx('POST'),
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('committed');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('honors numeric Retry-After header for 429 responses', async () => {
    const err = {
      status: 429,
      response: { headers: { 'retry-after': '2' } },
    };
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');

    const promise = retryRequest(fn, { initialDelay: 100, maxDelay: 10_000 }, ctx());

    // 2s Retry-After should be honored — not the 100ms initialDelay
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(1); // hasn't retried yet
    await vi.advanceTimersByTimeAsync(1_500);
    await promise;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('caps Retry-After at maxDelay', async () => {
    const err = {
      status: 429,
      response: { headers: { 'retry-after': '600' } }, // 10 minutes
    };
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');

    const promise = retryRequest(
      fn,
      { initialDelay: 100, maxDelay: 5_000 },
      ctx(),
    );
    // Should retry after at most 5s (maxDelay), not 10 minutes
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(promise).resolves.toBe('ok');
  });

  it('validates retry config', async () => {
    const fn = vi.fn().mockResolvedValue('x');
    await expect(retryRequest(fn, { maxRetries: -1 }, ctx())).rejects.toThrow(
      /maxRetries/,
    );
    await expect(retryRequest(fn, { initialDelay: 0 }, ctx())).rejects.toThrow(
      /initialDelay/,
    );
  });
});

describe('getTimeoutForMethod', () => {
  it('returns read timeout for GET and HEAD', () => {
    expect(getTimeoutForMethod('GET')).toBe(10_000);
    expect(getTimeoutForMethod('HEAD')).toBe(10_000);
    expect(getTimeoutForMethod('get')).toBe(10_000); // case-insensitive
  });

  it('returns write timeout for POST/PUT/PATCH', () => {
    expect(getTimeoutForMethod('POST')).toBe(60_000);
    expect(getTimeoutForMethod('PUT')).toBe(60_000);
    expect(getTimeoutForMethod('PATCH')).toBe(60_000);
  });

  it('returns delete timeout for DELETE', () => {
    expect(getTimeoutForMethod('DELETE')).toBe(30_000);
  });

  it('returns default for unknown methods', () => {
    expect(getTimeoutForMethod('OPTIONS')).toBe(30_000);
  });

  it('respects partial overrides', () => {
    expect(getTimeoutForMethod('GET', { read: 5_000 })).toBe(5_000);
    expect(getTimeoutForMethod('POST', { write: 90_000 })).toBe(90_000);
  });
});

describe('createTimeoutSignal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns a non-aborted signal initially', () => {
    const signal = createTimeoutSignal(1_000);
    expect(signal.aborted).toBe(false);
  });

  it('aborts after the configured timeout', () => {
    const signal = createTimeoutSignal(1_000);
    vi.advanceTimersByTime(1_001);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(TimeoutError);
  });

  it('rejects non-positive timeouts', () => {
    expect(() => createTimeoutSignal(0)).toThrow(/positive/);
    expect(() => createTimeoutSignal(-100)).toThrow(/positive/);
  });
});

describe('fetchWithTimeout', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('returns the response when fetch resolves before the timeout', async () => {
    const mockResponse = new Response('ok');
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
    const result = await fetchWithTimeout('http://x', {}, 1_000);
    expect(result).toBe(mockResponse);
  });

  it('throws TimeoutError when fetch exceeds the timeout', async () => {
    globalThis.fetch = vi.fn(
      (_url, opts: RequestInit | undefined) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }) as Promise<Response>,
    );

    const promise = fetchWithTimeout('http://x', {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });
});
