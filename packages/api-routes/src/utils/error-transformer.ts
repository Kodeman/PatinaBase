import { ZodError } from 'zod';
import type { ApiError } from '@patina/types';

/**
 * Standardized API error codes
 */
export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  BAD_REQUEST = 'BAD_REQUEST',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * HTTP status code mapping for error codes
 */
export const ERROR_STATUS_MAP: Record<ApiErrorCode, number> = {
  [ApiErrorCode.VALIDATION_ERROR]: 400,
  [ApiErrorCode.BAD_REQUEST]: 400,
  [ApiErrorCode.AUTHENTICATION_FAILED]: 401,
  [ApiErrorCode.AUTHORIZATION_FAILED]: 403,
  [ApiErrorCode.NOT_FOUND]: 404,
  [ApiErrorCode.CONFLICT]: 409,
  [ApiErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ApiErrorCode.TIMEOUT]: 504,
  [ApiErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ApiErrorCode.NETWORK_ERROR]: 502,
  [ApiErrorCode.INTERNAL_ERROR]: 500,
};

/**
 * Transform any error into a standardized ApiError format
 */
export function transformError(error: unknown): ApiError {
  const timestamp = new Date().toISOString();

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return {
      code: ApiErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: {
        issues: error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      },
      timestamp,
    };
  }

  // Handle fetch/network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      code: ApiErrorCode.NETWORK_ERROR,
      message: 'Network request failed',
      details: { originalMessage: error.message },
      timestamp,
    };
  }

  // Handle timeout errors
  if (error instanceof Error && error.message.toLowerCase().includes('timeout')) {
    return {
      code: ApiErrorCode.TIMEOUT,
      message: 'Request timeout',
      details: { originalMessage: error.message },
      timestamp,
    };
  }

  // Handle errors with status codes (from backend services)
  if (isErrorWithStatus(error)) {
    const code = getErrorCodeFromStatus(error.status);
    return {
      code,
      message: error.message || 'An error occurred',
      details: {
        status: error.status,
        statusText: error.statusText,
        ...(error.details && { backendDetails: error.details }),
      },
      timestamp,
    };
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return {
      code: ApiErrorCode.INTERNAL_ERROR,
      message: error.message || 'An unexpected error occurred',
      details: {
        name: error.name,
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
        }),
      },
      timestamp,
    };
  }

  // Handle already-formatted ApiError objects
  if (isApiError(error)) {
    return error;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      code: ApiErrorCode.INTERNAL_ERROR,
      message: error,
      timestamp,
    };
  }

  // Fallback for unknown error types
  return {
    code: ApiErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
    details: {
      type: typeof error,
      ...(process.env.NODE_ENV === 'development' && {
        error: String(error),
      }),
    },
    timestamp,
  };
}

/**
 * Get HTTP status code for an error
 */
export function getErrorStatus(error: ApiError): number {
  return ERROR_STATUS_MAP[error.code as ApiErrorCode] || 500;
}

/**
 * Map HTTP status code to error code
 */
function getErrorCodeFromStatus(status: number): ApiErrorCode {
  if (status >= 400 && status < 500) {
    switch (status) {
      case 400:
        return ApiErrorCode.BAD_REQUEST;
      case 401:
        return ApiErrorCode.AUTHENTICATION_FAILED;
      case 403:
        return ApiErrorCode.AUTHORIZATION_FAILED;
      case 404:
        return ApiErrorCode.NOT_FOUND;
      case 409:
        return ApiErrorCode.CONFLICT;
      case 429:
        return ApiErrorCode.RATE_LIMIT_EXCEEDED;
      default:
        return ApiErrorCode.BAD_REQUEST;
    }
  }

  if (status >= 500 && status < 600) {
    switch (status) {
      case 502:
        return ApiErrorCode.NETWORK_ERROR;
      case 503:
        return ApiErrorCode.SERVICE_UNAVAILABLE;
      case 504:
        return ApiErrorCode.TIMEOUT;
      default:
        return ApiErrorCode.INTERNAL_ERROR;
    }
  }

  return ApiErrorCode.INTERNAL_ERROR;
}

/**
 * Type guard for errors with HTTP status
 */
function isErrorWithStatus(
  error: unknown
): error is {
  status: number;
  statusText?: string;
  message?: string;
  details?: Record<string, unknown>;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as any).status === 'number'
  );
}

/**
 * Type guard for ApiError objects
 */
function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'timestamp' in error
  );
}

/**
 * Create a custom API error
 */
export function createApiError(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return {
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
}
