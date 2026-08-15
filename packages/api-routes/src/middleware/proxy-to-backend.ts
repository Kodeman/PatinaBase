/**
 * Backend Proxy Middleware
 *
 * Forwards Next.js API requests to NestJS services. Responsibilities:
 *   1. Reassemble the Supabase auth token from the Authorization header or
 *      `sb-<host>-auth-token.0`, `.1`, ... cookies. The
 *      reassembly is the load-bearing thing this module does that no library
 *      replaces.
 *   2. Verify the JWT signature before forwarding (A5 — defense-in-depth on
 *      top of @patina/auth's service-side verification). Never forward an
 *      unverifiable token.
 *   3. Forward the request with the standard header whitelist, retry via
 *      @patina/api-routes/utils/retry (exponential backoff + Retry-After +
 *      mutation-aware predicate), and convert errors into standardized
 *      apiError responses.
 *
 * Intentionally no circuit breaker. Per-service failure detection is a
 * platform concern (Cloudflare retries, container liveness probes). The
 * in-process per-worker CB was removed in this refactor — it never provided
 * system-wide protection and added 530 LOC of state-machine to maintain.
 */
import { cookies } from 'next/headers';
import { verifyJwtToken } from '@patina/auth';
import type { RouteContext } from '../utils/request-context';
import { extractTrustedIpAddress, getAuthToken } from '../utils/request-context';
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

export interface ServiceConfig {
  /** Service name (used for logging + trace correlation) */
  name: string;
  /** Base URL of the backend service */
  baseUrl: string;
  /** Optional path override (default: use request URL path) */
  path?: string;
  /**
   * Optional fetch implementation. On Cloudflare Workers, pass the service
   * binding's fetch (e.g. `(i, init) => env.SVC_PROJECTS.fetch(i, init)`) so
   * the proxy rides Worker→Worker bindings; defaults to global fetch.
   */
  fetcher?: typeof fetch;
}

export interface ErrorMapping {
  [statusCode: number]: { code: string; message: string };
}

export interface ResponseTransformer {
  transform: (data: unknown, response: Response) => unknown;
}

interface BaseProxyConfig {
  service: ServiceConfig;
  retry?: Partial<RetryConfig>;
  timeout?: Partial<TimeoutConfig>;
  /** Additional headers to forward from client request */
  forwardHeaders?: string[];
  /** Custom error code mappings for this service */
  errorMapping?: ErrorMapping;
  /** Optional response transformer */
  responseTransformer?: ResponseTransformer;
}

export type ProxyConfig =
  | (BaseProxyConfig & {
      /** Authentication is required by default. */
      requireAuth?: true;
      cache?: never;
    })
  | (BaseProxyConfig & {
      /** Public routes must opt out of authentication explicitly. */
      requireAuth: false;
      /** Public caching also requires CacheConfig.reviewedPublic. */
      cache?: CacheConfig;
    });

const DEFAULT_FORWARD_HEADERS = [
  'content-type',
  'accept',
  'accept-language',
  'user-agent',
];

const BLOCKED_HEADERS = new Set([
  'cookie',
  'authorization', // we set this explicitly with the verified token
  'host',
  'connection',
  'content-length', // will be recalculated
  'transfer-encoding',
  'cf-connecting-ip',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-request-id',
  'x-user-id',
]);

function getSupabaseProjectRef(): string | null {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const configuredUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!configuredUrl) return null;
  try {
    const hostname = new URL(configuredUrl).hostname;
    const projectRef = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1];
    return projectRef ?? null;
  } catch {
    return null;
  }
}

/**
 * Read a Supabase access token from the standard Bearer header or SSR cookie.
 * Handles unchunked and chunked auth cookies without combining separate
 * Supabase projects' sessions.
 * Returns null if no token found or extraction throws.
 */
async function extractAuthToken(request: Request): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  const bearerMatch = authorization ? /^Bearer\s+(\S+)$/i.exec(authorization.trim()) : null;
  if (bearerMatch) return bearerMatch[1];

  const projectRef = getSupabaseProjectRef();
  if (!projectRef) return null;

  const cookieStore = await cookies();
  const expectedName = `sb-${projectRef}-auth-token`;
  const cookieParts = new Map<number | 'base', string>();
  for (const cookie of cookieStore.getAll()) {
    const match = new RegExp(`^${expectedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.(\\d+))?$`).exec(
      cookie.name,
    );
    if (!match) continue;
    cookieParts.set(match[1] === undefined ? 'base' : Number(match[1]), cookie.value);
  }

  let raw = cookieParts.get('base');
  if (!raw) {
    const chunks: string[] = [];
    for (let i = 0; cookieParts.has(i); i++) chunks.push(cookieParts.get(i)!);
    raw = chunks.length > 0 ? chunks.join('') : undefined;
  }
  if (!raw) return null;

  try {
    const value = raw.startsWith('base64-')
      ? Buffer.from(raw.slice(7), 'base64url').toString('utf-8')
      : decodeURIComponent(raw);
    const parsed = JSON.parse(value);
    return parsed && typeof parsed.access_token === 'string'
      ? parsed.access_token
      : null;
  } catch {
    return null;
  }
}

function buildBackendUrl(request: Request, config: ProxyConfig): string {
  const baseUrl = config.service.baseUrl.replace(/\/$/, '');
  if (config.service.path) return `${baseUrl}${config.service.path}`;
  const url = new URL(request.url);
  return `${baseUrl}${url.pathname}${url.search}`;
}

function buildHeaders(
  request: Request,
  context: RouteContext,
  config: ProxyConfig,
  authToken: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};

  const toForward = config.forwardHeaders
    ? [...DEFAULT_FORWARD_HEADERS, ...config.forwardHeaders]
    : DEFAULT_FORWARD_HEADERS;

  for (const name of toForward) {
    if (BLOCKED_HEADERS.has(name.toLowerCase())) continue;
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  if (config.requireAuth !== false && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  headers['X-Request-Id'] = context.requestId;
  headers['X-Forwarded-For'] = extractTrustedIpAddress(request);
  const url = new URL(request.url);
  headers['X-Forwarded-Host'] = url.host;
  headers['X-Forwarded-Proto'] = url.protocol.replace(':', '');

  if (config.requireAuth !== false && context.user) {
    headers['X-User-Id'] = context.user.id;
  }

  return headers;
}

async function extractRequestBody(request: Request): Promise<RequestInit['body']> {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;

  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      return JSON.stringify(await request.json());
    }
    if (contentType.includes('multipart/form-data')) {
      return await request.formData();
    }
    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('text/')
    ) {
      return await request.text();
    }
    return await request.arrayBuffer();
  } catch (error) {
    throw createApiError(ApiErrorCode.BAD_REQUEST, 'Invalid request body', {
      originalError: error instanceof Error ? error.message : String(error),
    });
  }
}

async function processBackendResponse(
  response: Response,
  config: ProxyConfig,
): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = contentType.includes('application/json')
        ? await response.json()
        : { message: await response.text() };
    } catch {
      errorData = { message: response.statusText };
    }

    const customError = config.errorMapping?.[response.status];
    if (customError) {
      throw createApiError(customError.code as ApiErrorCode, customError.message, {
        status: response.status,
        statusText: response.statusText,
        backendError: errorData,
      });
    }

    const error: any = new Error(errorData.message || response.statusText);
    error.status = response.status;
    error.statusText = response.statusText;
    error.details = errorData;
    throw error;
  }

  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  return config.responseTransformer
    ? config.responseTransformer.transform(data, response)
    : data;
}

/**
 * Forward a request to a NestJS backend service.
 *
 * @example
 * ```typescript
 * export const GET = createRouteHandler(
 *   async (request, context) => proxyToBackend(request, context, {
 *     service: { name: 'catalog', baseUrl: process.env.CATALOG_SERVICE_URL! },
 *     retry: { maxRetries: 3 },
 *   }),
 *   { method: 'GET', path: '/api/catalog/products' }
 * );
 * ```
 */
export async function proxyToBackend(
  request: Request,
  context: RouteContext,
  config: ProxyConfig,
): Promise<Response> {
  const method = request.method;
  const backendUrl = buildBackendUrl(request, config);
  const requireAuth = config.requireAuth !== false;
  logRequestStart(context, method, backendUrl);

  try {
    // 1. Extract auth token from context (set by upstream middleware) or cookies.
    let authToken: string | null = getAuthToken(context) ?? null;
    if (!authToken && requireAuth) {
      try {
        authToken = await extractAuthToken(request);
      } catch (err) {
        console.error('[ProxyToBackend] Token extraction error:', err);
      }
    }

    // 2. If auth is required and we don't have a token, reject early.
    if (requireAuth && !authToken) {
      logRequestError(
        context,
        method,
        backendUrl,
        new Error('Authentication required'),
      );
      return apiUnauthorized('Authentication required to access this resource');
    }

    // 3. A5: verify JWT signature before forwarding. Defense-in-depth on top
    //    of @patina/auth's service-side verification — never forward an
    //    unverifiable token to a downstream service.
    if (authToken) {
      try {
        await verifyJwtToken(authToken);
      } catch {
        logRequestError(
          context,
          method,
          backendUrl,
          new Error('JWT verification failed at proxy'),
        );
        return apiUnauthorized('Invalid or expired authentication token');
      }
    }

    // 4. Build downstream request.
    const headers = buildHeaders(request, context, config, authToken);
    const body = await extractRequestBody(request);
    const timeout = getTimeoutForMethod(method, config.timeout);

    // 5. Execute with retry. retry.ts handles mutation-aware retry semantics
    //    (mutations are not retried unless shouldRetryMutation is true).
    const data = await retryRequest(
      async () => {
        const response = await fetchWithTimeout(
          backendUrl,
          { method, headers, body },
          timeout,
          config.service.fetcher,
        );
        return processBackendResponse(response, config);
      },
      config.retry,
      { method, url: backendUrl, requestId: context.requestId },
    );

    logRequestComplete(context, method, backendUrl, 200);
    return apiSuccess(data, undefined, {
      status: 200,
      cache: requireAuth ? undefined : config.cache,
    });
  } catch (error) {
    logRequestError(context, method, backendUrl, error);

    if (error instanceof TimeoutError) {
      return apiError(
        createApiError(
          ApiErrorCode.TIMEOUT,
          `Request to ${config.service.name} timed out`,
          {
            timeout: error.timeoutMs,
            serviceName: config.service.name,
            requestId: context.requestId,
          },
        ),
        504,
      );
    }

    if (error instanceof RetryExhaustedError) {
      const transformed = transformError(error.lastError);
      return apiError({
        ...transformed,
        message: `Request to ${config.service.name} failed after ${error.attempts} attempts`,
        details: {
          ...transformed.details,
          attempts: error.attempts,
          serviceName: config.service.name,
          requestId: context.requestId,
        },
      });
    }

    // Generic error path — preserve mapped-error status if present.
    const transformed = transformError(error);
    let status: number | undefined;
    if (error && typeof error === 'object' && 'details' in error) {
      const details = (error as any).details;
      if (details && typeof details === 'object' && 'status' in details) {
        status = details.status as number;
      }
    }

    return apiError(
      {
        ...transformed,
        details: {
          ...transformed.details,
          serviceName: config.service.name,
          requestId: context.requestId,
        },
      },
      status,
    );
  }
}

/**
 * Convenience factory for a proxy handler bound to a specific service.
 *
 * @example
 * ```typescript
 * const catalogProxy = createProxyHandler('catalog', process.env.CATALOG_SERVICE_URL!);
 * export const GET = createRouteHandler(catalogProxy, { method: 'GET', path: '/api/catalog/products' });
 * ```
 */
export function createProxyHandler(
  serviceName: string,
  baseUrl: string,
  options: (Omit<BaseProxyConfig, 'service'> & {
    service?: Partial<ServiceConfig>;
  } & (
      | { requireAuth?: true; cache?: never }
      | { requireAuth: false; cache?: CacheConfig }
    )) = {},
) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    return proxyToBackend(request, context, {
      ...options,
      service: { name: serviceName, baseUrl, ...options.service },
    });
  };
}
