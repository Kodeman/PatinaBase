import { logger } from './logger';

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatuses: number[];
  /** Network error codes that should trigger a retry */
  retryableErrors: string[];
  /** Whether to retry mutation requests (POST/PUT/PATCH/DELETE) (default: false) */
  shouldRetryMutation: boolean;
}

/**
 * Context information for retry logging
 */
export interface RetryContext {
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
  /** Request ID for tracing */
  requestId: string;
}

/**
 * Configuration for request timeouts based on HTTP method
 */
export interface TimeoutConfig {
  /** Default timeout for all requests (default: 30000ms) */
  default: number;
  /** Timeout for read operations (GET, HEAD) (default: 10000ms) */
  read: number;
  /** Timeout for write operations (POST, PUT, PATCH) (default: 60000ms) */
  write: number;
  /** Timeout for delete operations (default: 30000ms) */
  delete: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'],
  shouldRetryMutation: false,
};

/**
 * Default timeout configuration
 */
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  default: 30000,
  read: 10000,
  write: 60000,
  delete: 30000,
};

/**
 * HTTP methods that are considered mutations
 */
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * HTTP methods that are considered read operations
 */
const READ_METHODS = ['GET', 'HEAD'];

/**
 * Error class for retry exhaustion
 */
export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

/**
 * Error class for timeout
 */
export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Check if an error is retryable based on error code
 */
function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  // Check for Node.js error codes
  if ('code' in error && typeof error.code === 'string') {
    return config.retryableErrors.includes(error.code);
  }

  // Check for fetch API errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  return false;
}

/**
 * Check if an HTTP status code is retryable
 */
function isRetryableStatus(status: number, config: RetryConfig): boolean {
  // Never retry 501 Not Implemented
  if (status === 501) {
    return false;
  }

  return config.retryableStatuses.includes(status);
}

/**
 * Extract HTTP status from error
 */
function getStatusFromError(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  // Check for status property
  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  // Check for statusCode property
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  // Check for response.status
  if ('response' in error && error.response && typeof error.response === 'object') {
    if ('status' in error.response && typeof error.response.status === 'number') {
      return error.response.status;
    }
  }

  return null;
}

/**
 * Extract Retry-After header value from error (for 429 Too Many Requests)
 */
function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  let headers: Headers | Record<string, string> | undefined;

  // Extract headers from various error formats
  if ('response' in error && error.response && typeof error.response === 'object') {
    if ('headers' in error.response) {
      headers = error.response.headers as Headers | Record<string, string>;
    }
  } else if ('headers' in error) {
    headers = error.headers as Headers | Record<string, string>;
  }

  if (!headers) {
    return null;
  }

  // Get Retry-After header value
  let retryAfter: string | null = null;
  if (headers instanceof Headers) {
    retryAfter = headers.get('retry-after');
  } else if (typeof headers === 'object') {
    retryAfter = headers['retry-after'] || headers['Retry-After'] || null;
  }

  if (!retryAfter) {
    return null;
  }

  // Parse Retry-After: can be seconds or HTTP date
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000; // Convert to milliseconds
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

/**
 * Check if a request should be retried
 * @param error - The error that occurred
 * @param attempt - Current attempt number (1-indexed after first failure)
 * @param context - Request context
 * @param config - Retry configuration
 */
function shouldRetryRequest(
  error: unknown,
  attempt: number,
  context: RetryContext,
  config: RetryConfig
): boolean {
  // Check if max retries exceeded (attempt > maxRetries means we've done initial + maxRetries attempts)
  if (attempt > config.maxRetries) {
    return false;
  }

  // Check if mutation and retries are disabled for mutations
  const isMutation = MUTATION_METHODS.includes(context.method.toUpperCase());
  if (isMutation && !config.shouldRetryMutation) {
    return false;
  }

  // Check for retryable network errors
  if (isRetryableError(error, config)) {
    return true;
  }

  // Check for retryable HTTP status codes
  const status = getStatusFromError(error);
  if (status !== null && isRetryableStatus(status, config)) {
    return true;
  }

  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
  error: unknown
): number {
  // Check for Retry-After header (429 responses)
  const retryAfter = getRetryAfterMs(error);
  if (retryAfter !== null) {
    return Math.min(retryAfter, config.maxDelay);
  }

  // Calculate exponential backoff
  const exponentialDelay =
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

  // Add jitter: ±10% randomization to prevent thundering herd
  const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);

  return Math.round(cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a request with exponential backoff
 *
 * @param requestFn - Function that executes the request
 * @param config - Retry configuration (merged with defaults)
 * @param context - Request context for logging
 * @returns Promise resolving to request result
 * @throws {RetryExhaustedError} When all retry attempts are exhausted
 *
 * @example
 * ```typescript
 * const result = await retryRequest(
 *   () => fetch('https://api.example.com/data'),
 *   { maxRetries: 3 },
 *   { method: 'GET', url: 'https://api.example.com/data', requestId: '123' }
 * );
 * ```
 */
export async function retryRequest<T>(
  requestFn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context: RetryContext
): Promise<T> {
  const mergedConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  // Validate config
  if (mergedConfig.maxRetries < 0) {
    throw new Error('maxRetries must be non-negative');
  }
  if (mergedConfig.initialDelay <= 0) {
    throw new Error('initialDelay must be positive');
  }
  if (mergedConfig.maxDelay <= 0) {
    throw new Error('maxDelay must be positive');
  }
  if (mergedConfig.backoffMultiplier <= 0) {
    throw new Error('backoffMultiplier must be positive');
  }

  let lastError: unknown;
  let attempt = 0;

  while (true) {
    try {
      // Attempt the request
      const result = await requestFn();

      // Log successful retry if this wasn't the first attempt
      if (attempt > 0) {
        logger.info('Request succeeded after retry', {
          requestId: context.requestId,
          method: context.method,
          url: context.url,
          attempt,
          totalAttempts: attempt + 1,
        });
      }

      return result;
    } catch (error) {
      lastError = error;

      // Increment attempt counter
      attempt++;

      // Check if we should retry
      const shouldRetry = shouldRetryRequest(error, attempt, context, mergedConfig);

      if (!shouldRetry) {
        // Check if this was due to hitting max retries (and we actually attempted retries)
        if (attempt > mergedConfig.maxRetries && mergedConfig.maxRetries > 0) {
          // All retries exhausted
          logger.error('Request failed after all retries exhausted', {
            requestId: context.requestId,
            method: context.method,
            url: context.url,
            totalAttempts: attempt,
            lastError: lastError instanceof Error ? lastError.message : String(lastError),
            status: getStatusFromError(lastError),
          });

          throw new RetryExhaustedError(
            `Request failed after ${attempt} attempts`,
            attempt,
            lastError
          );
        }

        // Non-retryable error (4xx, etc.) or maxRetries is 0
        logger.warn('Request failed with non-retryable error', {
          requestId: context.requestId,
          method: context.method,
          url: context.url,
          attempt,
          error: error instanceof Error ? error.message : String(error),
          status: getStatusFromError(error),
        });

        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoffDelay(attempt - 1, mergedConfig, error);

      // Log retry attempt
      logger.warn('Request failed, retrying', {
        requestId: context.requestId,
        method: context.method,
        url: context.url,
        attempt,
        maxRetries: mergedConfig.maxRetries,
        retryIn: delay,
        error: error instanceof Error ? error.message : String(error),
        status: getStatusFromError(error),
      });

      // Wait before retrying
      await sleep(delay);
    }
  }
}

/**
 * Get timeout duration for HTTP method
 *
 * @param method - HTTP method (GET, POST, PUT, etc.)
 * @param config - Timeout configuration (merged with defaults)
 * @returns Timeout in milliseconds
 *
 * @example
 * ```typescript
 * const timeout = getTimeoutForMethod('GET'); // Returns 10000ms
 * const timeout = getTimeoutForMethod('POST'); // Returns 60000ms
 * ```
 */
export function getTimeoutForMethod(
  method: string,
  config: Partial<TimeoutConfig> = {}
): number {
  const mergedConfig: TimeoutConfig = {
    ...DEFAULT_TIMEOUT_CONFIG,
    ...config,
  };

  const upperMethod = method.toUpperCase();

  if (READ_METHODS.includes(upperMethod)) {
    return mergedConfig.read;
  }

  if (upperMethod === 'DELETE') {
    return mergedConfig.delete;
  }

  if (MUTATION_METHODS.includes(upperMethod)) {
    return mergedConfig.write;
  }

  return mergedConfig.default;
}

/**
 * Create an AbortSignal that times out after specified milliseconds
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns AbortSignal that will abort after timeout
 *
 * @example
 * ```typescript
 * const signal = createTimeoutSignal(5000);
 * const response = await fetch('https://api.example.com/data', { signal });
 * ```
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  if (timeoutMs <= 0) {
    throw new Error('Timeout must be positive');
  }

  // Always use manual implementation for better compatibility with fake timers in tests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs));
  }, timeoutMs);

  // Clean up timeout if request completes
  const signal = controller.signal;
  signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });

  return signal;
}

/**
 * Wrap a fetch request with timeout
 *
 * @param url - Request URL
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to Response
 * @throws {TimeoutError} When request exceeds timeout
 *
 * @example
 * ```typescript
 * const response = await fetchWithTimeout(
 *   'https://api.example.com/data',
 *   { method: 'GET' },
 *   5000
 * );
 * ```
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number
): Promise<Response> {
  const timeoutSignal = createTimeoutSignal(timeoutMs);

  // Merge timeout signal with existing signal if present
  const signal = options.signal
    ? mergeAbortSignals([options.signal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    // Convert abort error to TimeoutError if it was caused by our timeout
    if (timeoutSignal.aborted) {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs);
    }
    throw error;
  }
}

/**
 * Merge multiple AbortSignals into one
 * The merged signal aborts when any of the input signals abort
 */
function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }

    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    });
  }

  return controller.signal;
}
