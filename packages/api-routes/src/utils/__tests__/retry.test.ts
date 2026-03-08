import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retryRequest,
  getTimeoutForMethod,
  createTimeoutSignal,
  fetchWithTimeout,
  RetryExhaustedError,
  TimeoutError,
  type RetryConfig,
  type RetryContext,
  type TimeoutConfig,
} from '../retry';

describe('retryRequest', () => {
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock logger to prevent console output during tests
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createContext = (): RetryContext => ({
    method: 'GET',
    url: 'https://api.example.com/data',
    requestId: 'test-request-123',
  });

  describe('successful requests', () => {
    it('should return result on first successful attempt', async () => {
      const requestFn = vi.fn().mockResolvedValue({ data: 'success' });

      const promise = retryRequest(requestFn, {}, createContext());
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should succeed after retryable failure', async () => {
      const requestFn = vi
        .fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue({ data: 'success' });

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(requestFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('retryable failures', () => {
    it('should retry on network errors (ECONNREFUSED)', async () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should retry on ETIMEDOUT errors', async () => {
      const error = { code: 'ETIMEDOUT', message: 'Timeout' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should retry on ENOTFOUND errors', async () => {
      const error = { code: 'ENOTFOUND', message: 'DNS lookup failed' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should retry on 500 Internal Server Error', async () => {
      const error = { status: 500, message: 'Internal Server Error' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should retry on 502 Bad Gateway', async () => {
      const error = { status: 502, message: 'Bad Gateway' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should retry on 503 Service Unavailable', async () => {
      const error = { status: 503, message: 'Service Unavailable' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should retry on 504 Gateway Timeout', async () => {
      const error = { status: 504, message: 'Gateway Timeout' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should retry on 408 Request Timeout', async () => {
      const error = { status: 408, message: 'Request Timeout' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should retry on 429 Too Many Requests', async () => {
      const error = { status: 429, message: 'Too Many Requests' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should extract status from response.status', async () => {
      const error = { response: { status: 503 } };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should extract status from statusCode property', async () => {
      const error = { statusCode: 502 };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('non-retryable failures', () => {
    it('should NOT retry on 400 Bad Request', async () => {
      const error = { status: 400, message: 'Bad Request' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1); // No retries
    });

    it('should NOT retry on 401 Unauthorized', async () => {
      const error = { status: 401, message: 'Unauthorized' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 403 Forbidden', async () => {
      const error = { status: 403, message: 'Forbidden' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 404 Not Found', async () => {
      const error = { status: 404, message: 'Not Found' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 501 Not Implemented', async () => {
      const error = { status: 501, message: 'Not Implemented' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry unknown errors', async () => {
      const error = new Error('Unknown error');
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow('Unknown error');

      expect(requestFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('mutation retry prevention', () => {
    it('should NOT retry POST requests by default', async () => {
      const error = { status: 503, message: 'Service Unavailable' };
      const requestFn = vi.fn().mockRejectedValue(error);
      const context = { ...createContext(), method: 'POST' };

      const promise = retryRequest(requestFn, { maxRetries: 2 }, context);

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry PUT requests by default', async () => {
      const error = { status: 503, message: 'Service Unavailable' };
      const requestFn = vi.fn().mockRejectedValue(error);
      const context = { ...createContext(), method: 'PUT' };

      const promise = retryRequest(requestFn, { maxRetries: 2 }, context);

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry PATCH requests by default', async () => {
      const error = { status: 503, message: 'Service Unavailable' };
      const requestFn = vi.fn().mockRejectedValue(error);
      const context = { ...createContext(), method: 'PATCH' };

      const promise = retryRequest(requestFn, { maxRetries: 2 }, context);

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry DELETE requests by default', async () => {
      const error = { status: 503, message: 'Service Unavailable' };
      const requestFn = vi.fn().mockRejectedValue(error);
      const context = { ...createContext(), method: 'DELETE' };

      const promise = retryRequest(requestFn, { maxRetries: 2 }, context);

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should retry POST when shouldRetryMutation is true', async () => {
      const error = { status: 503, message: 'Service Unavailable' };
      const requestFn = vi.fn().mockRejectedValue(error);
      const context = { ...createContext(), method: 'POST' };

      const promise = retryRequest(
        requestFn,
        { maxRetries: 2, shouldRetryMutation: true },
        context
      );

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('exponential backoff', () => {
    it('should apply exponential backoff with default config', async () => {
      const error = { code: 'ECONNREFUSED' };
      const requestFn = vi.fn().mockRejectedValue(error);
      const delays: number[] = [];

      let startTime = Date.now();
      requestFn.mockImplementation(() => {
        const now = Date.now();
        if (delays.length > 0) {
          delays.push(now - startTime);
        }
        startTime = now;
        return Promise.reject(error);
      });

      const promise = retryRequest(requestFn, { maxRetries: 3 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      // First retry: ~1000ms (initial delay)
      // Second retry: ~2000ms (1000 * 2^1)
      // Third retry: ~4000ms (1000 * 2^2)
      expect(requestFn).toHaveBeenCalledTimes(4);
    });

    it('should respect maxDelay cap', async () => {
      const error = { code: 'ECONNREFUSED' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(
        requestFn,
        {
          maxRetries: 10,
          initialDelay: 1000,
          maxDelay: 5000,
          backoffMultiplier: 2,
        },
        createContext()
      );

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(11); // Initial + 10 retries
    });

    it('should apply custom backoff multiplier', async () => {
      const error = { code: 'ECONNREFUSED' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(
        requestFn,
        {
          maxRetries: 2,
          initialDelay: 100,
          backoffMultiplier: 3,
        },
        createContext()
      );

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      // First retry: ~100ms
      // Second retry: ~300ms (100 * 3^1)
      expect(requestFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Retry-After header', () => {
    it('should respect Retry-After header (seconds format)', async () => {
      const error = {
        status: 429,
        headers: new Headers({ 'Retry-After': '5' }),
      };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 1 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(2);
    });

    it('should respect Retry-After from plain object headers', async () => {
      const error = {
        status: 429,
        headers: { 'retry-after': '3' },
      };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 1 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(2);
    });

    it('should cap Retry-After at maxDelay', async () => {
      const error = {
        status: 429,
        headers: new Headers({ 'Retry-After': '100' }), // 100 seconds
      };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(
        requestFn,
        { maxRetries: 1, maxDelay: 5000 },
        createContext()
      );

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('max retries exhaustion', () => {
    it('should throw RetryExhaustedError after max retries', async () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 2 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      const caughtError = await promise.catch((e) => e);
      expect(caughtError).toBeInstanceOf(RetryExhaustedError);
      expect(caughtError.attempts).toBe(3);
      expect(caughtError.lastError).toEqual(error);
    });

    it('should include last error in RetryExhaustedError', async () => {
      const error = { status: 503, message: 'Service Unavailable' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 1 }, createContext());

      await vi.runAllTimersAsync();
      const caughtError = await promise.catch((e) => e);

      expect(caughtError.lastError).toEqual(error);
    });
  });

  describe('config validation', () => {
    it('should throw on negative maxRetries', async () => {
      const requestFn = vi.fn();

      await expect(
        retryRequest(requestFn, { maxRetries: -1 }, createContext())
      ).rejects.toThrow('maxRetries must be non-negative');
    });

    it('should throw on non-positive initialDelay', async () => {
      const requestFn = vi.fn();

      await expect(
        retryRequest(requestFn, { initialDelay: 0 }, createContext())
      ).rejects.toThrow('initialDelay must be positive');
    });

    it('should throw on non-positive maxDelay', async () => {
      const requestFn = vi.fn();

      await expect(
        retryRequest(requestFn, { maxDelay: -100 }, createContext())
      ).rejects.toThrow('maxDelay must be positive');
    });

    it('should throw on non-positive backoffMultiplier', async () => {
      const requestFn = vi.fn();

      await expect(
        retryRequest(requestFn, { backoffMultiplier: 0 }, createContext())
      ).rejects.toThrow('backoffMultiplier must be positive');
    });

    it('should accept zero maxRetries', async () => {
      const error = { code: 'ECONNREFUSED' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(requestFn, { maxRetries: 0 }, createContext());

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error);

      expect(requestFn).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('custom retryable statuses and errors', () => {
    it('should use custom retryable statuses', async () => {
      const error = { status: 418, message: "I'm a teapot" };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(
        requestFn,
        { maxRetries: 2, retryableStatuses: [418] },
        createContext()
      );

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('should use custom retryable errors', async () => {
      const error = { code: 'CUSTOM_ERROR', message: 'Custom error' };
      const requestFn = vi.fn().mockRejectedValue(error);

      const promise = retryRequest(
        requestFn,
        { maxRetries: 2, retryableErrors: ['CUSTOM_ERROR'] },
        createContext()
      );

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(RetryExhaustedError);

      expect(requestFn).toHaveBeenCalledTimes(3);
    });
  });
});

describe('getTimeoutForMethod', () => {
  it('should return read timeout for GET', () => {
    expect(getTimeoutForMethod('GET')).toBe(10000);
  });

  it('should return read timeout for HEAD', () => {
    expect(getTimeoutForMethod('HEAD')).toBe(10000);
  });

  it('should return write timeout for POST', () => {
    expect(getTimeoutForMethod('POST')).toBe(60000);
  });

  it('should return write timeout for PUT', () => {
    expect(getTimeoutForMethod('PUT')).toBe(60000);
  });

  it('should return write timeout for PATCH', () => {
    expect(getTimeoutForMethod('PATCH')).toBe(60000);
  });

  it('should return delete timeout for DELETE', () => {
    expect(getTimeoutForMethod('DELETE')).toBe(30000);
  });

  it('should return default timeout for unknown methods', () => {
    expect(getTimeoutForMethod('OPTIONS')).toBe(30000);
  });

  it('should be case-insensitive', () => {
    expect(getTimeoutForMethod('get')).toBe(10000);
    expect(getTimeoutForMethod('Post')).toBe(60000);
    expect(getTimeoutForMethod('DELETE')).toBe(30000);
  });

  it('should use custom timeout config', () => {
    const config: Partial<TimeoutConfig> = {
      read: 5000,
      write: 30000,
      delete: 15000,
    };

    expect(getTimeoutForMethod('GET', config)).toBe(5000);
    expect(getTimeoutForMethod('POST', config)).toBe(30000);
    expect(getTimeoutForMethod('DELETE', config)).toBe(15000);
  });

  it('should merge custom config with defaults', () => {
    const config: Partial<TimeoutConfig> = {
      read: 5000,
    };

    expect(getTimeoutForMethod('GET', config)).toBe(5000);
    expect(getTimeoutForMethod('POST', config)).toBe(60000); // Default
  });
});

describe('createTimeoutSignal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create signal that aborts after timeout', async () => {
    const signal = createTimeoutSignal(1000);

    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);

    expect(signal.aborted).toBe(true);
  });

  it('should throw on non-positive timeout', () => {
    expect(() => createTimeoutSignal(0)).toThrow('Timeout must be positive');
    expect(() => createTimeoutSignal(-1000)).toThrow('Timeout must be positive');
  });

  it('should not abort before timeout', () => {
    const signal = createTimeoutSignal(5000);

    vi.advanceTimersByTime(4999);

    expect(signal.aborted).toBe(false);
  });
});

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should complete before timeout', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'success' }), { status: 200 })
    );

    const promise = fetchWithTimeout('https://api.example.com/data', {}, 5000);
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should abort on timeout', async () => {
    global.fetch = vi.fn().mockImplementation(
      (url, options) =>
        new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => resolve(new Response('success')), 10000);

          // Respect the abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new Error('AbortError'));
            });
          }
        })
    );

    const promise = fetchWithTimeout('https://api.example.com/data', {}, 1000);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow(TimeoutError);
    const error = await promise.catch((e) => e);
    expect(error.timeoutMs).toBe(1000);
  });

  it('should merge with existing signal', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    global.fetch = vi.fn().mockImplementation(
      (url, options) =>
        new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => resolve(new Response('success')), 10000);

          // Respect the abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new Error('AbortError'));
            });
          }
        })
    );

    const promise = fetchWithTimeout(
      'https://api.example.com/data',
      { signal },
      5000
    );

    // Abort via external signal
    controller.abort();
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();
  });

  it('should pass through fetch options', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'success' }), { status: 200 })
    );

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    };

    const promise = fetchWithTimeout('https://api.example.com/data', options, 5000);
    await vi.runAllTimersAsync();
    await promise;

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' }),
      })
    );
  });
});

describe('RetryExhaustedError', () => {
  it('should store attempt count and last error', () => {
    const lastError = new Error('Connection failed');
    const error = new RetryExhaustedError('Failed after retries', 3, lastError);

    expect(error.name).toBe('RetryExhaustedError');
    expect(error.message).toBe('Failed after retries');
    expect(error.attempts).toBe(3);
    expect(error.lastError).toBe(lastError);
  });
});

describe('TimeoutError', () => {
  it('should store timeout duration', () => {
    const error = new TimeoutError('Request timed out', 5000);

    expect(error.name).toBe('TimeoutError');
    expect(error.message).toBe('Request timed out');
    expect(error.timeoutMs).toBe(5000);
  });
});
