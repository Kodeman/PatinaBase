/**
 * Rate Limiter
 *
 * Client-side rate limiting to prevent abuse and DoS attacks.
 *
 * Features:
 * - Sliding window rate limiting
 * - Per-operation limits
 * - Memory-efficient cleanup
 *
 * Note: This is client-side rate limiting. Server-side rate limiting
 * should also be implemented for complete protection.
 *
 * @module lib/security/rate-limiter
 */

import { logSecurityEvent } from './sanitize';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Rate limit configurations for different operations
 */
export const RATE_LIMITS = {
  bulkOperations: {
    maxRequests: 5,
    windowMs: 60000, // 5 requests per minute
  },
  search: {
    maxRequests: 30,
    windowMs: 60000, // 30 searches per minute
  },
  apiCall: {
    maxRequests: 100,
    windowMs: 60000, // 100 API calls per minute
  },
} as const;

/**
 * Rate Limiter class using sliding window algorithm
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup old entries every 5 minutes
    if (typeof window !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  /**
   * Checks if a request can proceed
   *
   * @param key - Unique identifier for the operation
   * @param config - Rate limit configuration
   * @returns True if request can proceed
   */
  canProceed(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get existing timestamps for this key
    const timestamps = this.requests.get(key) || [];

    // Filter out timestamps outside the current window
    const recentRequests = timestamps.filter(t => t > windowStart);

    // Check if limit exceeded
    if (recentRequests.length >= config.maxRequests) {
      logSecurityEvent('rate_limit_exceeded', {
        key,
        requests: recentRequests.length,
        limit: config.maxRequests,
        windowMs: config.windowMs,
      });
      return false;
    }

    // Add current timestamp
    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return true;
  }

  /**
   * Gets remaining requests in current window
   *
   * @param key - Unique identifier
   * @param config - Rate limit configuration
   * @returns Number of remaining requests
   */
  getRemaining(key: string, config: RateLimitConfig): number {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const timestamps = this.requests.get(key) || [];
    const recentRequests = timestamps.filter(t => t > windowStart);

    return Math.max(0, config.maxRequests - recentRequests.length);
  }

  /**
   * Gets time until next request is allowed
   *
   * @param key - Unique identifier
   * @param config - Rate limit configuration
   * @returns Milliseconds until reset, or 0 if requests available
   */
  getTimeUntilReset(key: string, config: RateLimitConfig): number {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const timestamps = this.requests.get(key) || [];
    const recentRequests = timestamps.filter(t => t > windowStart);

    if (recentRequests.length < config.maxRequests) {
      return 0;
    }

    // Time until oldest request expires
    const oldestTimestamp = recentRequests[0];
    return Math.max(0, oldestTimestamp + config.windowMs - now);
  }

  /**
   * Resets rate limit for a key
   *
   * @param key - Unique identifier to reset
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Cleans up old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [key, timestamps] of this.requests.entries()) {
      const recent = timestamps.filter(t => now - t < maxAge);

      if (recent.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recent);
      }
    }
  }

  /**
   * Destroys the rate limiter and clears interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.requests.clear();
  }
}

/**
 * Global rate limiter instance
 */
export const rateLimiter = new RateLimiter();

/**
 * Higher-order function to add rate limiting to async functions
 *
 * @param fn - Function to rate limit
 * @param key - Rate limit key
 * @param config - Rate limit configuration
 * @returns Rate-limited function
 *
 * @example
 * ```typescript
 * const limitedBulkPublish = withRateLimit(
 *   bulkPublish,
 *   'bulk-publish',
 *   RATE_LIMITS.bulkOperations
 * );
 * ```
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  key: string,
  config: RateLimitConfig
): T {
  return (async (...args: any[]) => {
    if (!rateLimiter.canProceed(key, config)) {
      const timeUntilReset = rateLimiter.getTimeUntilReset(key, config);
      const secondsUntilReset = Math.ceil(timeUntilReset / 1000);

      throw new Error(
        `Rate limit exceeded. Please wait ${secondsUntilReset} seconds before trying again.`
      );
    }

    return fn(...args);
  }) as T;
}
