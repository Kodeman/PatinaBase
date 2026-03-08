/**
 * Backend Proxy Middleware
 *
 * Enterprise-grade proxy middleware that routes Next.js API requests to NestJS backend services.
 * Integrates retry logic, circuit breaker pattern, auth forwarding, and comprehensive error handling.
 *
 * @module proxy-to-backend
 */

import { getToken } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import type { RouteContext } from '../utils/request-context';
import { getAuthToken } from '../utils/request-context';
import {
  retryRequest,
  fetchWithTimeout,
  getTimeoutForMethod,
  RetryExhaustedError,
  TimeoutError,
  type RetryConfig,
  type TimeoutConfig,
} from '../utils/retry';
import {
  getCircuitBreaker,
  CircuitBreakerOpenError,
  type CircuitBreakerConfig,
} from '../utils/circuit-breaker';
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  type CacheConfig,
} from '../utils/response-wrapper';
import {
  transformError,
  ApiErrorCode,
  createApiError,
} from '../utils/error-transformer';
import {
  logRequestStart,
  logRequestComplete,
  logRequestError,
} from '../utils/logger';

/**
 * Service configuration for backend proxy
 */
export interface ServiceConfig {
  /** Service name (used for circuit breaker identification) */
  name: string;
  /** Base URL of the backend service */
  baseUrl: string;
  /** Optional path override (default: use request URL path) */
  path?: string;
}

/**
 * Custom error code mapping for service-specific errors
 */
export interface ErrorMapping {
  [statusCode: number]: {
    /** Error code to use instead of default */
    code: string;
    /** Error message to use instead of default */
    message: string;
  };
}

/**
 * Response transformer for modifying backend responses
 */
export interface ResponseTransformer {
  /**
   * Transform response data before returning
   * @param data - Response data from backend
   * @param response - Original Response object
   * @returns Transformed data
   */
  transform: (data: unknown, response: Response) => unknown;
}

/**
 * Complete proxy configuration
 */
export interface ProxyConfig {
  /** Backend service configuration */
  service: ServiceConfig;
  /** Retry configuration (merged with defaults) */
  retry?: Partial<RetryConfig>;
  /** Circuit breaker configuration (merged with defaults) */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Timeout configuration (merged with defaults) */
  timeout?: Partial<TimeoutConfig>;
  /** Whether authentication is required (default: true) */
  requireAuth?: boolean;
  /** Additional headers to forward from client request */
  forwardHeaders?: string[];
  /** Custom error code mappings for this service */
  errorMapping?: ErrorMapping;
  /** Optional response transformer */
  responseTransformer?: ResponseTransformer;
  /** Cache configuration for successful responses */
  cache?: CacheConfig;
}

/**
 * Default headers to forward from client request to backend
 */
const DEFAULT_FORWARD_HEADERS = [
  'content-type',
  'accept',
  'accept-language',
  'user-agent',
];

/**
 * Headers that should never be forwarded
 */
const BLOCKED_HEADERS = [
  'cookie',
  'authorization', // Handled separately
  'host',
  'connection',
  'content-length', // Will be recalculated
  'transfer-encoding',
];

/**
 * Build the complete backend URL from request and config
 *
 * @param request - Original client request
 * @param config - Proxy configuration
 * @returns Complete backend URL
 */
function buildBackendUrl(request: Request, config: ProxyConfig): string {
  const { service } = config;
  const baseUrl = service.baseUrl.replace(/\/$/, ''); // Remove trailing slash

  // Use custom path if provided, otherwise extract from request URL
  if (service.path) {
    return `${baseUrl}${service.path}`;
  }

  // Extract path and query from request URL
  const url = new URL(request.url);
  const pathAndQuery = url.pathname + url.search;

  return `${baseUrl}${pathAndQuery}`;
}

/**
 * Build headers for backend request
 *
 * @param request - Original client request
 * @param context - Route context with user info
 * @param config - Proxy configuration
 * @returns Headers object for backend request
 */
function buildHeaders(
  request: Request,
  context: RouteContext,
  config: ProxyConfig,
  authToken?: string
): HeadersInit {
  const headers: Record<string, string> = {};

  // Determine which headers to forward
  const headersToForward = config.forwardHeaders
    ? [...DEFAULT_FORWARD_HEADERS, ...config.forwardHeaders]
    : DEFAULT_FORWARD_HEADERS;

  // Forward allowed headers
  for (const headerName of headersToForward) {
    const normalizedName = headerName.toLowerCase();
    if (BLOCKED_HEADERS.includes(normalizedName)) {
      continue;
    }

    const value = request.headers.get(headerName);
    if (value) {
      headers[headerName] = value;
    }
  }

  // Add authorization header
  // Token can come from: 1) direct parameter, 2) context (from withAuth middleware)
  if (config.requireAuth !== false) {
    const token = authToken || getAuthToken(context);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Add request ID for tracing
  headers['X-Request-Id'] = context.requestId;

  // Add forwarding headers
  headers['X-Forwarded-For'] = context.ip;
  headers['X-Forwarded-Host'] = new URL(request.url).host;
  headers['X-Forwarded-Proto'] = new URL(request.url).protocol.replace(':', '');

  // Add user ID if available (for backend audit logs)
  if (context.user) {
    headers['X-User-Id'] = context.user.id;
  }

  return headers;
}

/**
 * Extract request body based on content type
 *
 * @param request - Client request
 * @returns Request body (string, FormData, or null)
 */
async function extractRequestBody(request: Request): Promise<BodyInit | null> {
  const method = request.method.toUpperCase();

  // No body for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return null;
  }

  const contentType = request.headers.get('content-type') || '';

  // Handle JSON
  if (contentType.includes('application/json')) {
    try {
      const json = await request.json();
      return JSON.stringify(json);
    } catch (error) {
      throw createApiError(
        ApiErrorCode.BAD_REQUEST,
        'Invalid JSON in request body',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // Handle FormData
  if (contentType.includes('multipart/form-data')) {
    try {
      return await request.formData();
    } catch (error) {
      throw createApiError(
        ApiErrorCode.BAD_REQUEST,
        'Invalid form data in request body',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // Handle URL-encoded
  if (contentType.includes('application/x-www-form-urlencoded')) {
    try {
      return await request.text();
    } catch (error) {
      throw createApiError(
        ApiErrorCode.BAD_REQUEST,
        'Invalid URL-encoded data in request body',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // Handle plain text
  if (contentType.includes('text/')) {
    try {
      return await request.text();
    } catch (error) {
      throw createApiError(
        ApiErrorCode.BAD_REQUEST,
        'Invalid text in request body',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // Handle binary data (default)
  try {
    return await request.arrayBuffer();
  } catch (error) {
    throw createApiError(
      ApiErrorCode.BAD_REQUEST,
      'Invalid request body',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Determine if a request method should use retry logic
 *
 * @param method - HTTP method
 * @param config - Proxy configuration
 * @returns true if retries are enabled for this method
 */
function shouldRetryRequest(method: string, config: ProxyConfig): boolean {
  const upperMethod = method.toUpperCase();

  // GET and HEAD are always safe to retry
  if (['GET', 'HEAD'].includes(upperMethod)) {
    return true;
  }

  // POST, PUT, PATCH, DELETE only if explicitly enabled
  return config.retry?.shouldRetryMutation ?? false;
}

/**
 * Map backend error response to custom error code if configured
 *
 * @param status - HTTP status code
 * @param config - Proxy configuration
 * @returns Custom error mapping or null
 */
function mapBackendError(
  status: number,
  config: ProxyConfig
): { code: string; message: string } | null {
  if (!config.errorMapping) {
    return null;
  }

  return config.errorMapping[status] || null;
}

/**
 * Process backend response and extract data
 *
 * @param response - Backend response
 * @param config - Proxy configuration
 * @returns Processed response data
 * @throws Error if response is not successful
 */
async function processBackendResponse(
  response: Response,
  config: ProxyConfig
): Promise<unknown> {
  // Check for error responses
  if (!response.ok) {
    let errorData: any;
    const contentType = response.headers.get('content-type') || '';

    try {
      if (contentType.includes('application/json')) {
        errorData = await response.json();
      } else {
        errorData = { message: await response.text() };
      }
    } catch (error) {
      // Failed to parse error response
      errorData = { message: response.statusText };
    }

    // Check for custom error mapping
    const customError = mapBackendError(response.status, config);
    if (customError) {
      throw createApiError(
        customError.code as ApiErrorCode,
        customError.message,
        {
          status: response.status,
          statusText: response.statusText,
          backendError: errorData,
        }
      );
    }

    // Create error with status code
    const error: any = new Error(errorData.message || response.statusText);
    error.status = response.status;
    error.statusText = response.statusText;
    error.details = errorData;
    throw error;
  }

  // Parse successful response
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json();

    // Apply response transformer if provided
    if (config.responseTransformer) {
      return config.responseTransformer.transform(data, response);
    }

    return data;
  }

  // Non-JSON response (text, binary, etc.)
  return await response.text();
}

/**
 * Proxy request to backend service with retry, circuit breaker, and error handling
 *
 * This is the main proxy function that:
 * 1. Validates authentication requirements
 * 2. Checks circuit breaker state
 * 3. Builds backend request (URL, headers, body)
 * 4. Executes request with retry logic
 * 5. Handles errors with standardized format
 * 6. Transforms and returns response
 *
 * @param request - Client request to proxy
 * @param context - Route context with user info and metadata
 * @param config - Proxy configuration
 * @returns Response object with standardized format
 *
 * @example
 * ```typescript
 * // In Next.js API route
 * export const GET = createRouteHandler(
 *   compose(
 *     withAuth(auth),
 *     async (request, context) => {
 *       return proxyToBackend(request, context, {
 *         service: {
 *           name: 'catalog',
 *           baseUrl: process.env.CATALOG_SERVICE_URL!,
 *         },
 *         retry: { maxRetries: 3 },
 *       });
 *     }
 *   ),
 *   { method: 'GET', path: '/api/catalog/products' }
 * );
 * ```
 */
export async function proxyToBackend(
  request: Request,
  context: RouteContext,
  config: ProxyConfig
): Promise<Response> {
  const method = request.method;
  const backendUrl = buildBackendUrl(request, config);

  // Log request start
  logRequestStart(context, method, backendUrl);

  try {
    // Extract auth token if needed and not already in context
    // This allows routes to use proxyToBackend directly without withAuth middleware
    let authToken = getAuthToken(context);

    if (!authToken && config.requireAuth !== false) {
      try {
        // Build a request-like object with cookies for getToken
        const cookieStore = await cookies();

        // NextAuth may chunk large JWTs into multiple cookies
        // Try standard cookie first, then check for chunked cookies
        let sessionToken = cookieStore.get('next-auth.session-token')?.value ||
                          cookieStore.get('__Secure-next-auth.session-token')?.value;

        // If no single cookie, check for chunked cookies
        if (!sessionToken) {
          const chunks: string[] = [];
          let i = 0;
          while (true) {
            const chunk = cookieStore.get(`next-auth.session-token.${i}`)?.value ||
                         cookieStore.get(`__Secure-next-auth.session-token.${i}`)?.value;
            if (!chunk) break;
            chunks.push(chunk);
            i++;
          }
          if (chunks.length > 0) {
            sessionToken = chunks.join('');
          }
        }

        // Debug logging (uncomment when troubleshooting auth issues)
        // console.log('[ProxyToBackend] Token extraction:', {
        //   hasSessionToken: !!sessionToken,
        //   sessionTokenLength: sessionToken?.length || 0,
        //   hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        //   serviceName: config.service.name,
        // });

        if (sessionToken) {
          // Create a mock request object with the reconstructed session token
          // This handles both regular and chunked cookies
          const mockReq = {
            headers: request.headers,
            cookies: {
              get: (name: string) => {
                // For session token requests, return our reconstructed token
                if (name === 'next-auth.session-token' || name === '__Secure-next-auth.session-token') {
                  return { value: sessionToken };
                }
                return cookieStore.get(name);
              },
              getAll: () => cookieStore.getAll(),
            },
          };

          const jwtToken = await getToken({
            req: mockReq as any,
            secret: process.env.NEXTAUTH_SECRET,
            cookieName: 'next-auth.session-token',
          });

          // Debug logging (uncomment when troubleshooting auth issues)
          // console.log('[ProxyToBackend] JWT token result:', {
          //   hasJwtToken: !!jwtToken,
          //   hasAccessToken: !!jwtToken?.accessToken,
          //   tokenEmail: jwtToken?.email,
          // });

          if (jwtToken?.accessToken) {
            authToken = jwtToken.accessToken as string;
          }
        }
      } catch (err) {
        // Token extraction failed - will check requirement below
        console.error('[ProxyToBackend] Token extraction error:', err);
      }
    }

    // Check authentication requirement
    if (config.requireAuth === true && !authToken) {
      logRequestError(context, method, backendUrl, new Error('Authentication required'));
      return apiUnauthorized('Authentication required to access this resource');
    }

    // Store the token for use in buildHeaders
    // We use a temporary context extension for this
    const contextWithToken = authToken
      ? { ...context, _authToken: authToken }
      : context;

    // Get circuit breaker for this service
    const circuitBreaker = getCircuitBreaker(
      config.service.name,
      config.circuitBreaker
    );

    // Build request headers and body
    const headers = buildHeaders(request, contextWithToken, config, authToken);
    const body = await extractRequestBody(request);

    // Get timeout for this HTTP method
    const timeout = getTimeoutForMethod(method, config.timeout);

    // Execute request through circuit breaker with retry logic
    const data = await circuitBreaker.execute(
      async () => {
        // Determine if we should retry this request
        const useRetry = shouldRetryRequest(method, config);

        if (useRetry) {
          // Execute with retry logic
          return await retryRequest(
            async () => {
              const response = await fetchWithTimeout(
                backendUrl,
                {
                  method,
                  headers,
                  body: body as BodyInit | undefined,
                },
                timeout
              );

              return await processBackendResponse(response, config);
            },
            config.retry,
            {
              method,
              url: backendUrl,
              requestId: context.requestId,
            }
          );
        } else {
          // Execute without retry (for mutations with retries disabled)
          const response = await fetchWithTimeout(
            backendUrl,
            {
              method,
              headers,
              body: body as BodyInit | undefined,
            },
            timeout
          );

          return await processBackendResponse(response, config);
        }
      },
      {
        method,
        url: backendUrl,
        requestId: context.requestId,
      }
    );

    // Log successful completion
    logRequestComplete(context, method, backendUrl, 200);

    // Return success response
    return apiSuccess(data, undefined, {
      status: 200,
      cache: config.cache,
    });
  } catch (error) {
    // Log error
    logRequestError(context, method, backendUrl, error);

    // Handle circuit breaker open error
    if (error instanceof CircuitBreakerOpenError) {
      return apiError(
        createApiError(
          ApiErrorCode.SERVICE_UNAVAILABLE,
          `Service ${config.service.name} is temporarily unavailable`,
          {
            serviceName: error.serviceName,
            resetTime: error.resetTime,
            requestId: context.requestId,
          }
        ),
        503
      );
    }

    // Handle timeout error
    if (error instanceof TimeoutError) {
      return apiError(
        createApiError(
          ApiErrorCode.TIMEOUT,
          `Request to ${config.service.name} timed out`,
          {
            timeout: error.timeoutMs,
            serviceName: config.service.name,
            requestId: context.requestId,
          }
        ),
        504
      );
    }

    // Handle retry exhausted error
    if (error instanceof RetryExhaustedError) {
      // Transform the underlying error
      const transformed = transformError(error.lastError);
      return apiError(
        {
          ...transformed,
          message: `Request to ${config.service.name} failed after ${error.attempts} attempts`,
          details: {
            ...transformed.details,
            attempts: error.attempts,
            serviceName: config.service.name,
            requestId: context.requestId,
          },
        }
      );
    }

    // Handle all other errors
    const transformed = transformError(error);

    // Check if this is a custom mapped error (preserve original status)
    let status: number | undefined;
    if (error && typeof error === 'object' && 'details' in error) {
      const details = (error as any).details;
      if (details && typeof details === 'object' && 'status' in details) {
        status = details.status as number;
      }
    }

    return apiError({
      ...transformed,
      details: {
        ...transformed.details,
        serviceName: config.service.name,
        requestId: context.requestId,
      },
    }, status);
  }
}

/**
 * Create a proxy handler for a specific backend service
 * Convenience function for common proxy scenarios
 *
 * @param serviceName - Name of the backend service
 * @param baseUrl - Base URL of the backend service
 * @param options - Additional proxy options
 * @returns Proxy handler function
 *
 * @example
 * ```typescript
 * const catalogProxy = createProxyHandler('catalog', process.env.CATALOG_SERVICE_URL!);
 *
 * export const GET = createRouteHandler(
 *   compose(withAuth(auth), catalogProxy),
 *   { method: 'GET', path: '/api/catalog/products' }
 * );
 * ```
 */
export function createProxyHandler(
  serviceName: string,
  baseUrl: string,
  options: Partial<Omit<ProxyConfig, 'service'>> = {}
) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    return proxyToBackend(request, context, {
      ...options,
      service: {
        name: serviceName,
        baseUrl,
        ...options.service,
      },
    });
  };
}
