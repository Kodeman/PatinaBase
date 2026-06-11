/**
 * Global error handling utilities
 */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  traceId?: string;
}

export class AppError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;
  traceId?: string;
  statusCode?: number;

  constructor(error: ApiError | string, statusCode?: number) {
    if (typeof error === 'string') {
      super(error);
      this.code = 'UNKNOWN_ERROR';
    } else {
      super(error.message);
      this.code = error.code;
      this.details = error.details;
      this.requestId = error.requestId;
      this.traceId = error.traceId;
    }
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Convert error to user-friendly message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return getUserFriendlyMessage(error.code, error.message);
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred';
}

/**
 * Get user-friendly error messages based on error codes
 */
function getUserFriendlyMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    // Auth errors
    UNAUTHORIZED: 'Please sign in to continue',
    FORBIDDEN: 'You do not have permission to perform this action',
    TOKEN_EXPIRED: 'Your session has expired. Please sign in again',
    AUTHENTICATION_REQUIRED: 'Please sign in to continue',

    // Validation errors
    VALIDATION_ERROR: 'Please check your input and try again',
    INVALID_INPUT: 'The information provided is invalid',
    REQUIRED_FIELD: 'Please fill in all required fields',

    // Resource errors
    NOT_FOUND: 'The requested resource was not found',
    ALREADY_EXISTS: 'This resource already exists',
    CONFLICT: 'This action conflicts with existing data',

    // Network and service errors
    NETWORK_ERROR: 'Network error. Please check your connection',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again later',
    TIMEOUT: 'Request timed out. Please try again',
    SERVER_ERROR: 'Server error. Please try again later',

    // Cart/Order errors
    CART_EMPTY: 'Your cart is empty',
    INSUFFICIENT_STOCK: 'Some items are out of stock',
    INVALID_DISCOUNT_CODE: 'This discount code is invalid or expired',
    PAYMENT_FAILED: 'Payment failed. Please try another payment method',

    // File upload errors
    FILE_TOO_LARGE: 'File size exceeds the maximum allowed',
    INVALID_FILE_TYPE: 'This file type is not supported',
    UPLOAD_FAILED: 'File upload failed. Please try again',

    // Rate limiting
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later',

    // Generic
    UNKNOWN_ERROR: 'An unexpected error occurred',
  };

  return messages[code] || fallback;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('timeout')
    );
  }
  return false;
}

/**
 * Supabase error fingerprints that mean "the caller's session is no longer
 * valid" — an expired/absent JWT, a refresh-token failure, or a PostgREST
 * 401/JWT rejection. Supabase surfaces these as plain `PostgrestError` /
 * `AuthError` objects (NOT Axios-shaped), so `handleApiError` never saw them
 * as auth errors and the dashboard fell back to "0 open / 100%" instead of an
 * honest "your session expired" state. Centralised here so the query cache,
 * mutation cache, and any page-level guard agree on what counts as expiry.
 */
const SUPABASE_SESSION_EXPIRED_CODES = new Set([
  'PGRST301', // PostgREST: JWT expired / invalid
  'PGRST302', // PostgREST: anonymous access disallowed (no/expired token)
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'no_authorization',
]);

const SESSION_EXPIRED_MESSAGE_FRAGMENTS = [
  'jwt expired',
  'jwt is expired',
  'invalid jwt',
  'token is expired',
  'session expired',
  'session not found',
  'session from session_id claim in jwt does not exist',
  'refresh token not found',
  'refresh_token_not_found',
];

/**
 * Extract a normalized `{ code, status, message }` triple from the many error
 * shapes we encounter: our own `AppError`, Supabase `PostgrestError` /
 * `AuthError` plain objects, Axios errors, and bare `Error`s.
 */
function readErrorParts(error: unknown): {
  code?: string;
  status?: number;
  message: string;
} {
  if (error instanceof AppError) {
    return { code: error.code, status: error.statusCode, message: error.message };
  }
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    // Supabase AuthError uses `status`; PostgrestError uses `code` (PGRST*).
    // Axios uses `response.status`. Cover all three.
    const response = e.response as { status?: number } | undefined;
    const status =
      typeof e.status === 'number'
        ? e.status
        : typeof e.statusCode === 'number'
          ? (e.statusCode as number)
          : typeof response?.status === 'number'
            ? response.status
            : undefined;
    return {
      code: typeof e.code === 'string' ? e.code : undefined,
      status,
      message: typeof e.message === 'string' ? e.message : String(error),
    };
  }
  if (typeof error === 'string') return { message: error };
  return { message: 'An unexpected error occurred' };
}

/**
 * Check if an error specifically indicates an expired / invalid Supabase
 * session (JWT expired, missing refresh token, PostgREST 401). This is the
 * precise signal that the user must sign in again — distinct from a generic
 * 403 "you lack permission" which should NOT bounce the user to sign-in.
 */
export function isSessionExpiredError(error: unknown): boolean {
  const { code, status, message } = readErrorParts(error);

  if (status === 401) return true;
  if (code && SUPABASE_SESSION_EXPIRED_CODES.has(code)) return true;

  const lower = message.toLowerCase();
  return SESSION_EXPIRED_MESSAGE_FRAGMENTS.some((fragment) =>
    lower.includes(fragment)
  );
}

/**
 * Check if error is an auth error (expired session, missing token, or a
 * forbidden/401 response). Now also recognizes Supabase-shaped errors so the
 * query cache can route an expired session to sign-in rather than swallowing
 * it and rendering a misleading empty/zeroed dashboard.
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AppError) {
    if (
      error.code === 'UNAUTHORIZED' ||
      error.code === 'TOKEN_EXPIRED' ||
      error.code === 'AUTHENTICATION_REQUIRED' ||
      error.statusCode === 401
    ) {
      return true;
    }
  }
  return isSessionExpiredError(error);
}

/**
 * Route the browser to the sign-in page, preserving the current path as a
 * `callbackUrl` so the user lands back where they were after re-authenticating.
 * Matches the canonical redirect shape used by `useRequireAuth` /
 * `middleware.ts` (`/auth/signin?callbackUrl=…`).
 *
 * Guards:
 *  - no-op on the server (no `window`),
 *  - no-op if we're already on an `/auth/*` page (prevents redirect loops),
 *  - de-duped via a module-level flag so a burst of failing queries triggers
 *    exactly one navigation.
 */
let signInRedirectInFlight = false;

export function redirectToSignIn(reason?: string): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/auth')) return;
  if (signInRedirectInFlight) return;
  signInRedirectInFlight = true;

  if (reason) {
    console.warn(`[auth] Redirecting to sign-in: ${reason}`);
  }

  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  window.location.assign(
    `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
  );
}

/**
 * If the given error is an expired/invalid session, redirect to sign-in and
 * return `true`. Otherwise return `false` so the caller can fall through to
 * normal error handling (toast, inline error state, etc.). Centralizing the
 * "expired → sign-in" decision here keeps the query cache, mutation cache, and
 * any page-level guard consistent.
 */
export function handleAuthExpiry(error: unknown): boolean {
  if (!isSessionExpiredError(error)) return false;
  redirectToSignIn('session expired');
  return true;
}

/**
 * Log error to monitoring service (e.g., Sentry, DataDog)
 */
export function logError(error: unknown, context?: Record<string, any>) {
  // In production, send to error monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry.captureException(error, { extra: context });
    console.error('Error logged:', error, context);
  } else {
    console.error('Error:', error, context);
  }
}

/**
 * Handle API errors and convert to AppError
 */
export function handleApiError(error: any): AppError {
  // Already normalized — pass through untouched so we never re-wrap (and lose
  // the original statusCode) when a caller double-handles an error.
  if (error instanceof AppError) {
    return error;
  }

  // Supabase-shaped errors (PostgrestError / AuthError) are plain objects with
  // `.code` / `.status` and NO Axios `.response` / `.request`. Detect an
  // expired session here so it carries a 401 + TOKEN_EXPIRED code downstream
  // (isAuthError, the query cache, redirectToSignIn). Without this branch the
  // error fell through to the generic case, lost its 401-ness, and the
  // decisions dashboard rendered a misleading "0 open / 100%".
  if (error && typeof error === 'object' && !error.response && !error.request) {
    if (isSessionExpiredError(error)) {
      return new AppError(
        {
          code: 'TOKEN_EXPIRED',
          message: error.message || 'Your session has expired. Please sign in again',
          details: { code: error.code, status: error.status },
        },
        401
      );
    }

    // Postgres CHECK violation from the 00187 invoice guard: deleting a
    // project_ffe_items row that a live invoice line bills makes the FK's
    // ON DELETE SET NULL violate chk_line_items_ffe_kind. Translate the raw
    // constraint error into designer language here so the global mutation
    // toast is friendly. (The FF&E drawer also disables Remove proactively
    // via useFfeInvoiceCoverage — this mapping is the fallback for stale
    // coverage caches and non-drawer delete paths.)
    if (
      error.code === '23514' &&
      typeof error.message === 'string' &&
      error.message.includes('chk_line_items_ffe_kind')
    ) {
      return new AppError(
        {
          code: 'FFE_ITEM_BILLED',
          message: 'This item is on an invoice — void the invoice before removing it.',
          details: { code: error.code },
        },
        409
      );
    }
  }

  // Axios error
  if (error.response) {
    const { status, data } = error.response;

    // For 401 errors, preserve the status code to identify auth errors
    return new AppError(
      {
        code: data?.code || (status === 401 ? 'UNAUTHORIZED' : 'API_ERROR'),
        message: data?.message || 'An API error occurred',
        details: data?.details,
        requestId: data?.requestId,
        traceId: data?.traceId,
      },
      status
    );
  }

  // Network error (service unavailable, ECONNREFUSED, etc.)
  if (error.request) {
    // Check if it's a connection refused error (service down)
    const isServiceDown = error.code === 'ECONNREFUSED' ||
                         error.message?.includes('ECONNREFUSED') ||
                         error.message?.includes('Network Error');

    return new AppError({
      code: isServiceDown ? 'SERVICE_UNAVAILABLE' : 'NETWORK_ERROR',
      message: isServiceDown
        ? 'Service temporarily unavailable. Please try again later.'
        : 'Network error. Please check your connection',
      details: { originalError: error.code || error.message },
    });
  }

  // Generic error
  return new AppError(error.message || 'An unexpected error occurred');
}

/**
 * Retry logic for failed requests
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000, shouldRetry = () => true } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Exponential backoff
      const backoffDelay = delay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw lastError;
}

/**
 * Toast notification helper for errors
 */
export interface ToastOptions {
  title?: string;
  description: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

let toastFunction: ((options: ToastOptions) => void) | null = null;

export function setToastFunction(fn: (options: ToastOptions) => void) {
  toastFunction = fn;
}

export function showErrorToast(error: unknown, title = 'Error') {
  const message = getErrorMessage(error);
  if (toastFunction) {
    toastFunction({
      title,
      description: message,
      variant: 'destructive',
      duration: 5000,
    });
  }
}

export function showSuccessToast(message: string, title = 'Success') {
  if (toastFunction) {
    toastFunction({
      title,
      description: message,
      variant: 'success',
      duration: 3000,
    });
  }
}
