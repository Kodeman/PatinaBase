/**
 * Retry Logic Configuration
 *
 * Provides exponential backoff retry logic for network requests.
 * Handles transient failures gracefully with configurable retry policies.
 *
 * @module retry-config
 */

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number; // milliseconds
  retryableStatusCodes: number[];
  backoffMultiplier: number;
}

export const retryConfig = {
  standard: {
    maxRetries: 3,
    retryDelay: 1000,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    backoffMultiplier: 2,
  },
  bulk: {
    maxRetries: 2,
    retryDelay: 500,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    backoffMultiplier: 1.5,
  },
  critical: {
    maxRetries: 5,
    retryDelay: 2000,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    backoffMultiplier: 2,
  },
};

/**
 * Execute function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.retryDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on non-retryable errors
      const statusCode = error?.response?.status || error?.statusCode;
      if (statusCode && !config.retryableStatusCodes.includes(statusCode)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        throw error;
      }

      // Wait before retry with exponential backoff
      await sleep(delay);
      delay *= config.backoffMultiplier;
    }
  }

  throw lastError!;
}

/**
 * Sleep utility for async delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
