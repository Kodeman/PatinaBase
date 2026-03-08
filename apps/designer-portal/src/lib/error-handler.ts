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
 * Check if error is an auth error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AppError) {
    return (
      error.code === 'UNAUTHORIZED' ||
      error.code === 'TOKEN_EXPIRED' ||
      error.statusCode === 401
    );
  }
  return false;
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
