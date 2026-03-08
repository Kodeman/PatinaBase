import {
  calculateBackoff,
  retry,
  sleep,
  shouldRetryHttpError,
  CircuitBreaker,
} from './retry';

describe('Retry Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      const delay1 = calculateBackoff(1, 1000, 30000, 2);
      const delay2 = calculateBackoff(2, 1000, 30000, 2);
      const delay3 = calculateBackoff(3, 1000, 30000, 2);

      // First attempt: 1000ms ± 25%
      expect(delay1).toBeGreaterThanOrEqual(750);
      expect(delay1).toBeLessThanOrEqual(1250);

      // Second attempt: 2000ms ± 25%
      expect(delay2).toBeGreaterThanOrEqual(1500);
      expect(delay2).toBeLessThanOrEqual(2500);

      // Third attempt: 4000ms ± 25%
      expect(delay3).toBeGreaterThanOrEqual(3000);
      expect(delay3).toBeLessThanOrEqual(5000);
    });

    it('should respect max delay', () => {
      const delay = calculateBackoff(10, 1000, 5000, 2);
      expect(delay).toBeLessThanOrEqual(6250); // 5000 + 25% jitter
    });

    it('should apply jitter', () => {
      const delays = new Set();
      for (let i = 0; i < 10; i++) {
        delays.add(calculateBackoff(1, 1000, 30000, 2));
      }
      // With jitter, we should get different values
      expect(delays.size).toBeGreaterThan(1);
    });

    it('should handle first attempt correctly', () => {
      const delay = calculateBackoff(1, 2000, 30000, 2);
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(2500);
    });

    it('should handle custom multiplier', () => {
      const delay1 = calculateBackoff(1, 1000, 30000, 3);
      const delay2 = calculateBackoff(2, 1000, 30000, 3);

      expect(delay1).toBeGreaterThanOrEqual(750);
      expect(delay1).toBeLessThanOrEqual(1250);

      // Second attempt: 3000ms ± 25%
      expect(delay2).toBeGreaterThanOrEqual(2250);
      expect(delay2).toBeLessThanOrEqual(3750);
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(95); // Allow some margin
      expect(duration).toBeLessThan(1000); // More tolerant for slow systems
    });

    it('should handle zero sleep', async () => {
      const start = Date.now();
      await sleep(0);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // More tolerant for slower systems
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const error = new Error('fail');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(retry(fn, { maxAttempts: 3, initialDelay: 10 }))
        .rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use custom max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(retry(fn, { maxAttempts: 5, initialDelay: 10 }))
        .rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should call onRetry callback', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      await retry(fn, {
        initialDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        expect.any(Number)
      );
    });

    it('should respect shouldRetry function', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const shouldRetry = jest.fn().mockReturnValue(false);

      await expect(retry(fn, { shouldRetry, initialDelay: 10 }))
        .rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should continue retrying if shouldRetry returns true', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const shouldRetry = jest.fn().mockReturnValue(true);

      const result = await retry(fn, { shouldRetry, initialDelay: 10 });
      expect(result).toBe('success');
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should wait between retries', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const start = Date.now();
      await retry(fn, { initialDelay: 50, maxDelay: 50 });
      const duration = Date.now() - start;

      // Should have waited at least 50ms (minus margin for jitter)
      expect(duration).toBeGreaterThanOrEqual(35);
    });

    it('should handle default options', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn);
      expect(result).toBe('success');
    });
  });

  describe('shouldRetryHttpError', () => {
    it('should retry on 5xx errors', () => {
      expect(shouldRetryHttpError({ statusCode: 500 }, 1)).toBe(true);
      expect(shouldRetryHttpError({ statusCode: 502 }, 1)).toBe(true);
      expect(shouldRetryHttpError({ statusCode: 503 }, 1)).toBe(true);
    });

    it('should retry on 429 rate limit', () => {
      expect(shouldRetryHttpError({ statusCode: 429 }, 1)).toBe(true);
    });

    it('should not retry on 4xx errors (except 429)', () => {
      expect(shouldRetryHttpError({ statusCode: 400 }, 1)).toBe(false);
      expect(shouldRetryHttpError({ statusCode: 401 }, 1)).toBe(false);
      expect(shouldRetryHttpError({ statusCode: 403 }, 1)).toBe(false);
      expect(shouldRetryHttpError({ statusCode: 404 }, 1)).toBe(false);
    });

    it('should not retry on 2xx/3xx errors', () => {
      expect(shouldRetryHttpError({ statusCode: 200 }, 1)).toBe(false);
      expect(shouldRetryHttpError({ statusCode: 201 }, 1)).toBe(false);
      expect(shouldRetryHttpError({ statusCode: 301 }, 1)).toBe(false);
    });

    it('should retry on non-HTTP errors', () => {
      expect(shouldRetryHttpError(new Error('Network error'), 1)).toBe(true);
      expect(shouldRetryHttpError('String error', 1)).toBe(true);
      expect(shouldRetryHttpError(null, 1)).toBe(true);
    });
  });

  describe('CircuitBreaker', () => {
    it('should execute function when circuit is closed', async () => {
      const breaker = new CircuitBreaker();
      const fn = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should track failures', async () => {
      const breaker = new CircuitBreaker(3);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getFailures()).toBe(1);

      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getFailures()).toBe(2);
    });

    it('should open circuit after threshold failures', async () => {
      const breaker = new CircuitBreaker(3);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('open');
      expect(breaker.getFailures()).toBe(3);

      // Circuit is open, should throw immediately
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is open');
      expect(fn).toHaveBeenCalledTimes(3); // Should not call fn again
    });

    it('should reset failures on success', async () => {
      const breaker = new CircuitBreaker(3);
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getFailures()).toBe(1);

      await breaker.execute(fn);
      expect(breaker.getFailures()).toBe(0);
      expect(breaker.getState()).toBe('closed');
    });

    it('should transition to half-open after timeout', async () => {
      jest.useFakeTimers();

      const breaker = new CircuitBreaker(2, 1000);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');

      // Try immediately - should fail
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is open');

      // Advance time past reset timeout
      jest.advanceTimersByTime(1001);

      // Should transition to half-open and try again
      fn.mockResolvedValue('success');
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');

      jest.useRealTimers();
    });

    it('should use custom threshold', async () => {
      const breaker = new CircuitBreaker(5);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Should remain closed for 4 failures
      for (let i = 0; i < 4; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('fail');
        expect(breaker.getState()).toBe('closed');
      }

      // 5th failure should open circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.getState()).toBe('open');
    });

    it('should reset manually', async () => {
      const breaker = new CircuitBreaker(2);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');

      // Manual reset
      breaker.reset();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailures()).toBe(0);

      // Should work again
      fn.mockResolvedValue('success');
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
    });

    it('should close circuit on success in half-open state', async () => {
      jest.useFakeTimers();

      const breaker = new CircuitBreaker(2, 1000);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      // Wait for half-open
      jest.advanceTimersByTime(1001);

      // Success should close circuit
      fn.mockResolvedValue('success');
      await breaker.execute(fn);
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailures()).toBe(0);

      jest.useRealTimers();
    });
  });
});
