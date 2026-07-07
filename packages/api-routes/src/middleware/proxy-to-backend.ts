/**
 * Backend Proxy Middleware
 *
 * Forwards Next.js API requests to NestJS services. Responsibilities:
 *   1. Reassemble the auth token from cookies — NextAuth chunks large JWTs
 *      across `next-auth.session-token.0`, `.1`, ...; Supabase chunks large
 *      session payloads across `sb-<host>-auth-token.0`, `.1`, ... The
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
import { getToken } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import { verifyJwtToken } from '@patina/auth';
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

export interface ProxyConfig {
  service: ServiceConfig;
  retry?: Partial<RetryConfig>;
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
]);

/**
 * Reassemble the auth token from cookies.
 * Handles NextAuth chunked session tokens and Supabase chunked auth tokens.
 * Returns null if no token found or extraction throws.
 */
async function extractAuthToken(request: Request): Promise<string | null> {
  const cookieStore = await cookies();

  // ─── NextAuth path ────────────────────────────────────────────────────────
  // Single cookie first, then check for `.0`, `.1`, ... chunked variants.
  let sessionToken =
    cookieStore.get('next-auth.session-token')?.value ??
    cookieStore.get('__Secure-next-auth.session-token')?.value;

  if (!sessionToken) {
    const chunks: string[] = [];
    for (let i = 0; ; i++) {
      const chunk =
        cookieStore.get(`next-auth.session-token.${i}`)?.value ??
        cookieStore.get(`__Secure-next-auth.session-token.${i}`)?.value;
      if (!chunk) break;
      chunks.push(chunk);
    }
    if (chunks.length > 0) sessionToken = chunks.join('');
  }

  if (sessionToken) {
    try {
      const mockReq = {
        headers: request.headers,
        cookies: {
          get: (name: string) => {
            if (
              name === 'next-auth.session-token' ||
              name === '__Secure-next-auth.session-token'
            ) {
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
      if (jwtToken?.accessToken && typeof jwtToken.accessToken === 'string') {
        return jwtToken.accessToken;
      }
    } catch {
      // Fall through to Supabase path.
    }
  }

  // ─── Supabase path ────────────────────────────────────────────────────────
  // `sb-<host>-auth-token` (or chunked `.0`, `.1`, ...) carries a base64-
  // encoded JSON session with `access_token`. Used by @supabase/ssr.
  const supabaseCookies = cookieStore
    .getAll()
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (supabaseCookies.length > 0) {
    const raw = supabaseCookies.map((c) => c.value).join('');
    const value = raw.startsWith('base64-')
      ? Buffer.from(raw.slice(7), 'base64').toString('utf-8')
      : raw;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed.access_token === 'string') {
        return parsed.access_token;
      }
    } catch {
      // Malformed Supabase cookie — return null below.
    }
  }

  return null;
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
  headers['X-Forwarded-For'] = context.ip;
  const url = new URL(request.url);
  headers['X-Forwarded-Host'] = url.host;
  headers['X-Forwarded-Proto'] = url.protocol.replace(':', '');

  if (context.user) headers['X-User-Id'] = context.user.id;

  return headers;
}

async function extractRequestBody(request: Request): Promise<BodyInit | null> {
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
  logRequestStart(context, method, backendUrl);

  try {
    // 1. Extract auth token from context (set by upstream middleware) or cookies.
    let authToken: string | null = getAuthToken(context) ?? null;
    if (!authToken && config.requireAuth !== false) {
      try {
        authToken = await extractAuthToken(request);
      } catch (err) {
        console.error('[ProxyToBackend] Token extraction error:', err);
      }
    }

    // 2. If auth is required and we don't have a token, reject early.
    if (config.requireAuth === true && !authToken) {
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
          { method, headers, body: body as BodyInit | undefined },
          timeout,
          config.service.fetcher,
        );
        return processBackendResponse(response, config);
      },
      config.retry,
      { method, url: backendUrl, requestId: context.requestId },
    );

    logRequestComplete(context, method, backendUrl, 200);
    return apiSuccess(data, undefined, { status: 200, cache: config.cache });
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
  options: Partial<Omit<ProxyConfig, 'service'>> & { service?: Partial<ServiceConfig> } = {},
) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    return proxyToBackend(request, context, {
      ...options,
      service: { name: serviceName, baseUrl, ...options.service },
    });
  };
}
