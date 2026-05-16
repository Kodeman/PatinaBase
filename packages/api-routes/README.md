# @patina/api-routes

Reusable Next.js 15 API route patterns and middleware for Patina portals.

## What it does

Each portal's `app/api/**/route.ts` files use this package to wrap their handlers with shared concerns: request context, logging, error transformation, request validation, response shaping, and — most importantly — proxying to NestJS backend services.

## Public surface

What 63 consumer files actually import. Everything below is exported from the package root (`@patina/api-routes`):

### Route handler factory

| Symbol | Purpose |
| --- | --- |
| `createRouteHandler(handler, config)` | Wraps a Next.js route handler with logging, error handling, and context creation. Used by every API route. |
| `compose(...middleware)` | Chains middleware. Right-to-left composition. |
| `createHandlers(handlers, config)` | Convenience factory for multiple HTTP methods on one path. |
| `createMultiMethodHandler(handlers, config)` | Same as above with a different shape. |
| `RouteConfig` | Type for the `config` argument. |

### Validation (Zod-based)

| Symbol | Purpose |
| --- | --- |
| `withValidation({ body?, query?, params? })` | Validates the request and populates `context.validatedData`. |
| `createQuerySchema(transforms?)` | Helper for building searchparams schemas. |
| `queryTransforms` | Reusable transforms (number, boolean, etc.). |
| `ValidationSchemas`, `RouteHandler` | Types. |

### Backend proxy

| Symbol | Purpose |
| --- | --- |
| `proxyToBackend(request, context, config)` | Forwards a Next.js request to a NestJS service. Handles auth-token reassembly, **JWT signature verification** (A5), retry with exponential backoff, timeout, error mapping, and response transformation. |
| `createProxyHandler(serviceName, baseUrl, options?)` | Factory that returns a bound `proxyToBackend` handler. |
| `ProxyConfig`, `ServiceConfig`, `ErrorMapping`, `ResponseTransformer` | Types. |

### Responses

| Symbol | Purpose |
| --- | --- |
| `apiSuccess(data, message?, options?)` | 200 with `{ success: true, data }`. |
| `apiError(error, status?)` | Standardized error response. |
| `apiValidationError(errors, message?)` | 422 for validation failures. |
| `apiUnauthorized(message?)` | 401. |
| `apiForbidden(message?)` | 403. |
| `apiNotFound(message?)` | 404. |
| `apiRateLimitExceeded(message?, retryAfter?)` | 429. |
| `CacheConfig`, `ApiResponseOptions` | Types. |

### Request context, errors, logging, tracing, metrics, retry

These are exposed but rarely imported directly — they're machinery for the wrappers above.

`RouteContext`, `createContext`, `setUser`, `setAuthToken`, `getAuthToken`, `setValidatedBody`, `setValidatedQuery`, `setValidatedParams`, `setCustom`, `hasRole`, `hasAnyRole`, `hasAllRoles`, `getRequestDuration`, `transformError`, `getErrorStatus`, `createApiError`, `ApiErrorCode`, `ERROR_STATUS_MAP`, `createLogger`, `logger`, `loggerFromContext`, `logRequestStart`, `logRequestComplete`, `logRequestError`, `logValidationError`, `logRateLimitExceeded`, `logAuthFailure`, `logAuthzFailure`, `Logger`, `LogLevel`, `LogEntry`, `LoggerConfig`, `retryRequest`, `getTimeoutForMethod`, `createTimeoutSignal`, `fetchWithTimeout`, `RetryExhaustedError`, `TimeoutError`, `RetryConfig`, `RetryContext`, `TimeoutConfig`, `createTracer`, `startRouteSpan`, `startProxySpan`, `recordRetryAttempt`, `recordCircuitBreakerEvent`, `recordCacheEvent`, `endSpanSuccess`, `endSpanError`, `TracingConfig`, `SpanAttributes`, `Span`, `InMemoryMetricsCollector`, `getMetricsCollector`, `setMetricsCollector`, `resetMetricsCollector`, `MetricsCollector`.

## Example

```ts
import {
  createRouteHandler,
  compose,
  withValidation,
  proxyToBackend,
  apiSuccess,
} from '@patina/api-routes';
import { z } from 'zod';

export const GET = createRouteHandler(
  async (request, context) =>
    proxyToBackend(request, context, {
      service: {
        name: 'catalog',
        baseUrl: process.env.CATALOG_SERVICE_URL!,
      },
      retry: { maxRetries: 3 },
      timeout: { read: 10_000 },
      cache: { maxAge: 60, staleWhileRevalidate: 300 },
    }),
  { method: 'GET', path: '/api/catalog/products' },
);
```

## Design decisions

**No circuit breaker.** Patina has three NestJS services. The in-process, per-worker circuit breaker that previously lived in `utils/circuit-breaker.ts` was 530 LOC of state-machine that never provided system-wide protection (each Next.js worker had its own CB instance). Per-service health detection is now a platform concern: Cloudflare retries handle transient connection failures; container liveness probes handle service-wide outages.

**Retry is a slim native implementation.** `utils/retry.ts` (~270 LOC) does exponential backoff with jitter, mutation-aware retry semantics, and `Retry-After` header parsing. `p-retry` was considered but doesn't cleanly support per-attempt delay override, which is required for `Retry-After` — the reason this module exists beyond simple backoff.

**Proxy verifies JWT signatures (A5).** Before forwarding a request to a NestJS service, the proxy calls `verifyJwtToken` from `@patina/auth` to verify the reassembled token. If verification fails, the proxy returns 401 instead of forwarding. This is defense-in-depth on top of `@patina/auth`'s service-side verification — the same `jose.jwtVerify` runs on both sides, but failing fast at the portal saves a round-trip and clarifies the failure source.

**Chunked-cookie reassembly is load-bearing.** Inside `proxy-to-backend.ts`, the `extractAuthToken` helper reassembles auth tokens from chunked cookies — NextAuth chunks large JWTs across `next-auth.session-token.0`, `.1`, ...; Supabase chunks session payloads across `sb-<host>-auth-token.0`, `.1`, ... with an optional `base64-` prefix. No library replaces this; do not refactor it without keeping all test cases green.

## Type stubs (transient)

`tsup` is configured with `dts: false` because of an unresolved tsconfig conflict. Types are emitted by `scripts/emit-types.js` as a hand-rolled stub — every exported symbol is declared as `any` so consumers get import resolution but no real type safety. Fixing this properly (enabling tsup's dts emit, or running tsc with the right config) is a follow-up. When adding a new runtime export, add the corresponding declaration to `scripts/emit-types.js`.

## Tests

`vitest run` from the package directory. 107 tests covering retry, timeout, fetchWithTimeout, proxy happy path, A5 token verification, chunked-cookie reassembly, error paths, metrics, tracing.

## Dependencies

- `next` >= 15.0.0 (peer)
- `next-auth` 5.0.0-beta.29 — used only by `proxy-to-backend.ts` for reassembling NextAuth chunked session tokens
- `@patina/auth` (workspace) — supplies `verifyJwtToken` for A5
- `@patina/types` (workspace) — domain types
- `zod` — validation
- `@opentelemetry/api` — tracing
