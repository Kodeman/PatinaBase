/**
 * Request retry + timeout primitives for proxy-to-backend.
 *
 * Slim native implementation (was 543 LOC; now ~270). p-retry was considered
 * but doesn't cleanly support per-attempt delay override — required by
 * Retry-After header handling, which is the load-bearing reason this module
 * exists at all (the simple exponential-backoff case is uninteresting).
 *
 * Public surface preserved (RetryConfig, RetryContext, TimeoutConfig,
 * retryRequest, getTimeoutForMethod, createTimeoutSignal, fetchWithTimeout,
 * RetryExhaustedError, TimeoutError) so proxy-to-backend.ts and any future
 * consumer keep working unchanged.
 */
import { logger } from './logger';

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatuses: number[];
  /** Network error codes that should trigger a retry */
  retryableErrors: string[];
  /** Whether to retry mutation requests (POST/PUT/PATCH/DELETE) (default: false) */
  shouldRetryMutation: boolean;
}

export interface RetryContext {
  method: string;
  url: string;
  requestId: string;
}

export interface TimeoutConfig {
  default: number;
  read: number;
  write: number;
  delete: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'],
  shouldRetryMutation: false,
};

const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  default: 30000,
  read: 10000,
  write: 60000,
  delete: 30000,
};

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const READ_METHODS = new Set(['GET', 'HEAD']);

export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

function getStatusFromError(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as Record<string, any>;
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (e.response && typeof e.response.status === 'number') return e.response.status;
  return null;
}

function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as Record<string, any>;
  const headers = e.response?.headers ?? e.headers;
  if (!headers) return null;

  let value: string | null = null;
  if (headers instanceof Headers) {
    value = headers.get('retry-after');
  } else if (typeof headers === 'object') {
    value = headers['retry-after'] ?? headers['Retry-After'] ?? null;
  }
  if (!value) return null;

  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) return seconds * 1000;

  const date = new Date(value);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());

  return null;
}

function isRetryable(error: unknown, config: RetryConfig): boolean {
  // Network errors (Node error codes)
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string' && config.retryableErrors.includes(code)) {
      return true;
    }
  }
  // Generic fetch failures
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return true;
  }
  // HTTP status codes (never retry 501 Not Implemented)
  const status = getStatusFromError(error);
  if (status !== null && status !== 501 && config.retryableStatuses.includes(status)) {
    return true;
  }
  return false;
}

function backoffDelay(attempt: number, config: RetryConfig, error: unknown): number {
  // Retry-After takes precedence over backoff (capped at maxDelay)
  const retryAfter = getRetryAfterMs(error);
  if (retryAfter !== null) return Math.min(retryAfter, config.maxDelay);

  const exp = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  const capped = Math.min(exp, config.maxDelay);
  // ±10% jitter to prevent thundering herd
  const jitter = capped * 0.1 * (Math.random() * 2 - 1);
  return Math.round(capped + jitter);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry a request with exponential backoff + jitter.
 * Respects `Retry-After` for 429 responses. Throws RetryExhaustedError when
 * maxRetries is exhausted; re-throws original error on non-retryable failures.
 */
export async function retryRequest<T>(
  requestFn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context: RetryContext,
): Promise<T> {
  const c: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  if (c.maxRetries < 0) throw new Error('maxRetries must be non-negative');
  if (c.initialDelay <= 0) throw new Error('initialDelay must be positive');
  if (c.maxDelay <= 0) throw new Error('maxDelay must be positive');
  if (c.backoffMultiplier <= 0) throw new Error('backoffMultiplier must be positive');

  const isMutation = MUTATION_METHODS.has(context.method.toUpperCase());
  const allowRetryForThisMethod = !isMutation || c.shouldRetryMutation;

  let lastError: unknown;
  for (let attempt = 0; attempt <= c.maxRetries; attempt++) {
    try {
      const result = await requestFn();
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

      const retryable = allowRetryForThisMethod && isRetryable(error, c);
      const exhausted = attempt >= c.maxRetries;

      if (!retryable) {
        logger.warn('Request failed with non-retryable error', {
          requestId: context.requestId,
          method: context.method,
          url: context.url,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
          status: getStatusFromError(error),
        });
        throw error;
      }

      if (exhausted) {
        logger.error('Request failed after all retries exhausted', {
          requestId: context.requestId,
          method: context.method,
          url: context.url,
          totalAttempts: attempt + 1,
          lastError: error instanceof Error ? error.message : String(error),
          status: getStatusFromError(error),
        });
        throw new RetryExhaustedError(
          `Request failed after ${attempt + 1} attempts`,
          attempt + 1,
          error,
        );
      }

      const delay = backoffDelay(attempt, c, error);
      logger.warn('Request failed, retrying', {
        requestId: context.requestId,
        method: context.method,
        url: context.url,
        attempt: attempt + 1,
        maxRetries: c.maxRetries,
        retryIn: delay,
        error: error instanceof Error ? error.message : String(error),
        status: getStatusFromError(error),
      });
      await sleep(delay);
    }
  }

  // Unreachable — loop always returns or throws — but TypeScript wants it
  throw new RetryExhaustedError('unreachable', c.maxRetries, lastError);
}

/** Get timeout duration for an HTTP method (read/write/delete/default tiers). */
export function getTimeoutForMethod(
  method: string,
  config: Partial<TimeoutConfig> = {},
): number {
  const c: TimeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  const m = method.toUpperCase();
  if (READ_METHODS.has(m)) return c.read;
  if (m === 'DELETE') return c.delete;
  if (MUTATION_METHODS.has(m)) return c.write;
  return c.default;
}

/** Create an AbortSignal that aborts after timeoutMs with a TimeoutError reason. */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  if (timeoutMs <= 0) throw new Error('Timeout must be positive');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs));
  }, timeoutMs);

  controller.signal.addEventListener(
    'abort',
    () => clearTimeout(timeoutId),
    { once: true },
  );

  return controller.signal;
}

/** Combine multiple AbortSignals; the result aborts when any input aborts. */
function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/** fetch() wrapper that throws TimeoutError if the request exceeds timeoutMs. */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number,
): Promise<Response> {
  const timeoutSignal = createTimeoutSignal(timeoutMs);
  const signal = options.signal
    ? mergeAbortSignals([options.signal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs);
    }
    throw error;
  }
}
