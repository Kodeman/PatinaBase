import type { ApiResponse, ApiError } from '@patina/types';
import { transformError, getErrorStatus } from './error-transformer';

/**
 * Cache control configuration for responses
 */
export interface CacheConfig {
  /** Cache TTL in seconds */
  ttl?: number;
  /** Stale-while-revalidate window in seconds */
  swr?: number;
  /** Whether the cache is public or private */
  visibility?: 'public' | 'private';
  /** Disable caching entirely */
  noCache?: boolean;
}

/**
 * Options for API response
 */
export interface ApiResponseOptions {
  /** HTTP status code */
  status?: number;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Cache control configuration */
  cache?: CacheConfig;
}

/**
 * Create a successful API response
 */
export function apiSuccess<T>(
  data: T,
  meta?: Record<string, unknown>,
  options: ApiResponseOptions = {}
): Response {
  const { status = 200, headers = {}, cache } = options;

  const body: ApiResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  };

  const responseHeaders = {
    'Content-Type': 'application/json',
    ...headers,
    ...getCacheHeaders(cache),
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

/**
 * Create an error API response
 */
export function apiError(
  error: unknown,
  statusOverride?: number
): Response {
  const apiError = transformError(error);
  const status = statusOverride ?? getErrorStatus(apiError);

  const body: ApiResponse<never> = {
    success: false,
    error: apiError,
  };

  const responseHeaders = {
    'Content-Type': 'application/json',
    // Never cache error responses
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

/**
 * Create a validation error response
 */
export function apiValidationError(
  message: string,
  details?: Record<string, unknown>
): Response {
  const error: ApiError = {
    code: 'VALIDATION_ERROR',
    message,
    details,
    timestamp: new Date().toISOString(),
  };

  const body: ApiResponse<never> = {
    success: false,
    error,
  };

  return new Response(JSON.stringify(body), {
    status: 400,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Create an unauthorized error response
 */
export function apiUnauthorized(message = 'Authentication required'): Response {
  const error: ApiError = {
    code: 'AUTHENTICATION_FAILED',
    message,
    timestamp: new Date().toISOString(),
  };

  const body: ApiResponse<never> = {
    success: false,
    error,
  };

  return new Response(JSON.stringify(body), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Create a forbidden error response
 */
export function apiForbidden(message = 'Insufficient permissions'): Response {
  const error: ApiError = {
    code: 'AUTHORIZATION_FAILED',
    message,
    timestamp: new Date().toISOString(),
  };

  const body: ApiResponse<never> = {
    success: false,
    error,
  };

  return new Response(JSON.stringify(body), {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Create a not found error response
 */
export function apiNotFound(message = 'Resource not found'): Response {
  const error: ApiError = {
    code: 'NOT_FOUND',
    message,
    timestamp: new Date().toISOString(),
  };

  const body: ApiResponse<never> = {
    success: false,
    error,
  };

  return new Response(JSON.stringify(body), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Create a rate limit exceeded response
 */
export function apiRateLimitExceeded(
  retryAfter?: number,
  details?: Record<string, unknown>
): Response {
  const error: ApiError = {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests',
    details: {
      ...details,
      ...(retryAfter && { retryAfter }),
    },
    timestamp: new Date().toISOString(),
  };

  const body: ApiResponse<never> = {
    success: false,
    error,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  if (retryAfter) {
    headers['Retry-After'] = String(retryAfter);
  }

  return new Response(JSON.stringify(body), {
    status: 429,
    headers,
  });
}

/**
 * Generate Cache-Control headers based on cache configuration
 */
function getCacheHeaders(cache?: CacheConfig): Record<string, string> {
  if (!cache) {
    return {};
  }

  if (cache.noCache) {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };
  }

  const parts: string[] = [];

  // Visibility
  parts.push(cache.visibility || 'public');

  // Max age / s-maxage
  if (cache.ttl !== undefined) {
    if (cache.visibility === 'private') {
      parts.push(`max-age=${cache.ttl}`);
    } else {
      parts.push(`s-maxage=${cache.ttl}`);
    }
  }

  // Stale-while-revalidate
  if (cache.swr !== undefined) {
    parts.push(`stale-while-revalidate=${cache.swr}`);
  }

  return {
    'Cache-Control': parts.join(', '),
  };
}
