# @patina/api-routes

Enterprise-grade API route patterns and middleware for Next.js 15 App Router.

## Overview

`@patina/api-routes` provides a complete solution for building production-ready API routes in Next.js applications. It includes composable middleware, retry logic, circuit breaker pattern, authentication, validation, observability, and standardized error handling—all designed to work seamlessly with Next.js 15's App Router.

## Features

- ✅ **Composable Middleware Pattern** - Chain middleware functions for clean, maintainable routes
- ✅ **Retry Logic** - Exponential backoff with configurable retry strategies for transient failures
- ✅ **Circuit Breaker** - Automatic fault isolation and fast-fail for unhealthy backend services
- ✅ **Request/Response Validation** - Zod-based validation with automatic error handling
- ✅ **Authentication** - NextAuth v5 integration with automatic session management
- ✅ **Role-Based Access Control** - Fine-grained authorization with role middleware
- ✅ **Backend Service Proxy** - Seamless proxying to NestJS microservices with auth forwarding
- ✅ **Distributed Tracing** - OpenTelemetry integration for request tracing
- ✅ **Prometheus Metrics** - Built-in metrics collection for monitoring
- ✅ **Response Caching** - Configurable caching with stale-while-revalidate support
- ✅ **Standardized Errors** - Consistent error format across all routes
- ✅ **Request Context** - Type-safe context passing through middleware chain
- ✅ **Structured Logging** - Built-in logging with correlation IDs
- ✅ **Type-Safe Throughout** - Full TypeScript support with type inference

## Installation

```bash
pnpm add @patina/api-routes
```

### Peer Dependencies

This package requires:
- `next` >= 15.0.0
- `next-auth` ~5.0.0-beta.29
- `zod` ^3.22.4

## Quick Start

### 30-Second Example

```typescript
// app/api/products/route.ts
import { createRouteHandler, compose, withAuth, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: process.env.CATALOG_SERVICE_URL!,
        },
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 300 },
      });
    }
  ),
  { method: 'GET', path: '/api/products' }
);
```

That's it! You now have a production-ready API route with:
- Authentication
- Retry logic (3 attempts with exponential backoff)
- Circuit breaker protection
- Request tracing
- Structured logging
- Response caching (5 minutes)
- Standardized error handling

## Core Concepts

### Route Handler Factory

The `createRouteHandler` function wraps your handler logic and provides automatic:
- Request context creation
- Error handling and transformation
- Request/response logging
- Next.js App Router compatibility

```typescript
export const GET = createRouteHandler(
  async (request, context) => {
    // Your handler logic
    return apiSuccess({ message: 'Hello' });
  },
  { method: 'GET', path: '/api/hello' }
);
```

### Middleware Composition

Middleware functions are composable using the `compose` helper. They execute in order from top to bottom:

```typescript
export const POST = createRouteHandler(
  compose(
    withAuth(auth),              // 1. Authenticate user
    requireRole('admin'),        // 2. Check authorization
    withValidation({ body: schema }), // 3. Validate request
    async (request, context) => { // 4. Execute handler
      return apiSuccess({ created: true });
    }
  ),
  { method: 'POST' }
);
```

### Backend Proxy

The `proxyToBackend` function routes requests to backend microservices with automatic:
- Auth token forwarding
- Retry on transient failures
- Circuit breaker protection
- Error transformation
- Response caching

```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'catalog',
    baseUrl: process.env.CATALOG_SERVICE_URL!,
  },
  retry: { maxRetries: 3 },
  cache: { maxAge: 300 },
});
```

## API Reference

### Route Handler Factory

#### `createRouteHandler(handler, config)`

Create a Next.js route handler with automatic error handling and logging.

**Parameters:**
- `handler` - The route handler function or composed middleware chain
- `config` - Route configuration
  - `method` - HTTP method (GET, POST, etc.)
  - `path` - Route path (for logging)
  - `cache` - Default cache configuration

**Returns:** Next.js route handler function

**Example:**
```typescript
export const GET = createRouteHandler(
  async (request, context) => {
    return apiSuccess({ data: 'value' });
  },
  { method: 'GET', path: '/api/data' }
);
```

#### `compose(...middleware)`

Compose multiple middleware functions into a single handler.

**Parameters:**
- `...middleware` - Array of middleware functions

**Returns:** Composed route handler

**Example:**
```typescript
const handler = compose(
  withAuth(auth),
  withRole({ roles: 'admin' }),
  async (request, context) => {
    return apiSuccess({ admin: true });
  }
);
```

#### `createMultiMethodHandler(options)`

Create handlers for multiple HTTP methods with shared middleware.

**Parameters:**
- `middleware` - Array of middleware to apply to all methods
- `handlers` - Object mapping methods to handlers
- `config` - Shared route configuration

**Returns:** Object with method handlers (GET, POST, etc.)

**Example:**
```typescript
const { GET, POST } = createMultiMethodHandler({
  middleware: [withAuth(auth)],
  handlers: {
    GET: async (request, context) => apiSuccess({ method: 'GET' }),
    POST: async (request, context) => apiSuccess({ method: 'POST' }),
  },
});

export { GET, POST };
```

### Middleware

#### `withAuth(authFn, options?)`

Authenticate user using NextAuth and add to context.

**Parameters:**
- `authFn` - NextAuth auth function
- `options` - Authentication options
  - `required` - Whether auth is required (default: true)
  - `message` - Custom error message

**Example:**
```typescript
// Required authentication
withAuth(auth)

// Optional authentication
withAuth(auth, { required: false })

// Custom error message
withAuth(auth, { message: 'Login required' })
```

#### `withRole(options)`

Enforce role-based access control.

**Parameters:**
- `roles` - Single role or array of roles
- `strategy` - 'any' or 'all' (default: 'any')
- `message` - Custom error message

**Example:**
```typescript
// Single role
withRole({ roles: 'admin' })

// Multiple roles (any)
withRole({ roles: ['admin', 'designer'] })

// Multiple roles (all required)
withRole({ roles: ['admin', 'designer'], strategy: 'all' })
```

**Helper Functions:**
```typescript
requireRole('admin')              // Require single role
requireAnyRole(['admin', 'designer']) // Require any role
```

**Predefined Middleware:**
```typescript
roleMiddleware.admin              // Admin only
roleMiddleware.designer           // Designer only
roleMiddleware.client             // Client only
roleMiddleware.adminOrDesigner    // Admin or designer
```

#### `withValidation(schemas)`

Validate request body, query, and params using Zod.

**Parameters:**
- `body` - Zod schema for request body
- `query` - Zod schema for query parameters
- `params` - Zod schema for URL parameters

**Example:**
```typescript
const bodySchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

const querySchema = z.object({
  page: z.coerce.number().min(1),
  limit: z.coerce.number().min(1).max(100),
});

withValidation({
  body: bodySchema,
  query: querySchema,
  params: z.object({ id: z.string().uuid() }),
})
```

**Validated data is available in context:**
```typescript
async (request, context) => {
  const { name, email } = context.validatedData.body;
  const { page, limit } = context.validatedData.query;
  const { id } = context.validatedData.params;
}
```

**Common Schemas:**
```typescript
import {
  paginationSchema,        // page, limit
  uuidParamSchema,         // { id: uuid }
  emailSchema,             // email validation
  passwordSchema,          // password validation
  searchableListQuerySchema, // page, limit, search, sort
} from '@patina/api-routes';
```

#### `proxyToBackend(request, context, config)`

Proxy request to backend microservice with retry and circuit breaker.

**Parameters:**
- `request` - Client request
- `context` - Route context
- `config` - Proxy configuration
  - `service` - Service configuration
    - `name` - Service name
    - `baseUrl` - Service base URL
    - `path` - Optional path override
  - `retry` - Retry configuration
  - `circuitBreaker` - Circuit breaker configuration
  - `timeout` - Timeout configuration
  - `requireAuth` - Whether auth is required (default: true)
  - `forwardHeaders` - Additional headers to forward
  - `errorMapping` - Custom error code mappings
  - `responseTransformer` - Response transformation function
  - `cache` - Cache configuration

**Example:**
```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'catalog',
    baseUrl: process.env.CATALOG_SERVICE_URL!,
    path: '/api/v1/products', // Optional
  },
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  timeout: {
    read: 10000,
    write: 30000,
  },
  cache: {
    maxAge: 300,
    staleWhileRevalidate: 60,
  },
});
```

### Response Helpers

#### `apiSuccess(data, meta?, options?)`

Create successful response with standardized format.

**Parameters:**
- `data` - Response data
- `meta` - Optional metadata (pagination, etc.)
- `options` - Response options
  - `status` - HTTP status code (default: 200)
  - `cache` - Cache configuration

**Example:**
```typescript
// Basic success
apiSuccess({ message: 'Created' })

// With metadata
apiSuccess(
  { items: [...] },
  { total: 100, page: 1, pageSize: 20 }
)

// With caching
apiSuccess(
  { products: [...] },
  undefined,
  {
    cache: {
      ttl: 300,
      swr: 60,
      visibility: 'public',
    },
  }
)
```

#### Error Response Helpers

```typescript
// Generic error (auto-transforms)
apiError(error)

// Specific errors
apiValidationError('Invalid email', { field: 'email' })
apiUnauthorized('Authentication required')
apiForbidden('Insufficient permissions')
apiNotFound('Product not found')
apiRateLimitExceeded(60) // Retry after 60 seconds
```

### Utilities

#### Retry Configuration

```typescript
import { retryRequest, RetryConfig } from '@patina/api-routes';

const config: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  shouldRetryMutation: false,
};
```

#### Circuit Breaker

```typescript
import { getCircuitBreaker, CircuitBreakerConfig } from '@patina/api-routes';

const config: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 60000,
  halfOpenRequests: 1,
};

const breaker = getCircuitBreaker('catalog', config);

// Monitor state changes
breaker.onStateChange((oldState, newState, metrics) => {
  console.log(`Circuit breaker ${oldState} → ${newState}`, metrics);
});
```

#### Request Context

```typescript
interface RouteContext {
  requestId: string;        // Unique request ID
  ip: string;               // Client IP
  userAgent?: string;       // User agent
  user?: RouteUser;         // Authenticated user
  validatedData: {          // Validated data
    body?: unknown;
    query?: unknown;
    params?: unknown;
  };
  startTime: number;        // Request start time
  custom?: Record<string, unknown>; // Custom data
}
```

**Context Helpers:**
```typescript
import { hasRole, hasAnyRole, getRequestDuration } from '@patina/api-routes';

if (hasRole(context, 'admin')) {
  // User is admin
}

const duration = getRequestDuration(context);
```

#### Logging

```typescript
import { loggerFromContext } from '@patina/api-routes';

const logger = loggerFromContext(context);

logger.info('Processing order', { orderId: '123' });
logger.warn('Slow response', { duration: 5000 });
logger.error('Processing failed', { error });
```

## Usage Examples

### Example 1: Simple GET Route

```typescript
// app/api/hello/route.ts
import { createRouteHandler, apiSuccess } from '@patina/api-routes';

export const GET = createRouteHandler(
  async (request, context) => {
    return apiSuccess({ message: 'Hello, World!' });
  },
  { method: 'GET', path: '/api/hello' }
);
```

### Example 2: Protected POST Route

```typescript
// app/api/products/route.ts
import { createRouteHandler, compose, withAuth, withValidation, apiSuccess } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  description: z.string().optional(),
});

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ body: createProductSchema }),
    async (request, context) => {
      const product = context.validatedData.body;
      // Product is fully typed from Zod schema
      return apiSuccess({ created: true, product });
    }
  ),
  { method: 'POST', path: '/api/products' }
);
```

### Example 3: Proxy to Backend Service

```typescript
// app/api/catalog/products/route.ts
import { createRouteHandler, proxyToBackend } from '@patina/api-routes';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3011';

export const GET = createRouteHandler(
  async (request, context) => {
    return proxyToBackend(request, context, {
      service: {
        name: 'catalog',
        baseUrl: CATALOG_URL,
        path: '/api/v1/products',
      },
      requireAuth: false,
      retry: { maxRetries: 3 },
      timeout: { read: 10000 },
      cache: { maxAge: 300, staleWhileRevalidate: 60 },
    });
  },
  { method: 'GET' }
);
```

### Example 4: Role-Based Access

```typescript
// app/api/admin/users/route.ts
import { createRouteHandler, compose, withAuth, requireRole, apiSuccess } from '@patina/api-routes';
import { auth } from '@/lib/auth';

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    requireRole('admin'),
    async (request, context) => {
      // Only admins can access this
      return apiSuccess({ users: [] });
    }
  ),
  { method: 'GET', path: '/api/admin/users' }
);
```

### Example 5: Custom Validation

```typescript
// app/api/search/route.ts
import { createRouteHandler, compose, withValidation, apiSuccess } from '@patina/api-routes';
import { z } from 'zod';

const searchSchema = z.object({
  q: z.string().min(3, 'Search query must be at least 3 characters'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.enum(['relevance', 'price', 'date']).default('relevance'),
});

export const GET = createRouteHandler(
  compose(
    withValidation({ query: searchSchema }),
    async (request, context) => {
      const { q, page, limit, sort } = context.validatedData.query;
      // All values are properly typed and validated
      return apiSuccess({
        results: [],
        pagination: { page, limit, total: 0 },
      });
    }
  ),
  { method: 'GET', path: '/api/search' }
);
```

## Configuration

### Environment Variables

Configure backend service URLs (server-side only):

```bash
# .env.local
CATALOG_SERVICE_URL=http://localhost:3011
ORDERS_SERVICE_URL=http://localhost:3015
PROJECTS_SERVICE_URL=http://localhost:3016
COMMS_SERVICE_URL=http://localhost:3017
USER_MANAGEMENT_SERVICE_URL=http://localhost:3010
```

**Important:** Do NOT use `NEXT_PUBLIC_` prefix for service URLs—they should only be accessible server-side.

### Retry Configuration Guidelines

```typescript
// Safe reads (GET, HEAD) - aggressive retry
retry: {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
}

// Idempotent writes (PUT) - moderate retry
retry: {
  maxRetries: 2,
  shouldRetryMutation: true,
}

// Non-idempotent operations (POST orders, payments) - no retry
retry: {
  maxRetries: 1, // No retry to prevent duplicates
}
```

### Timeout Configuration Guidelines

```typescript
// Fast reads (list, search)
timeout: { read: 5000 }

// Standard reads
timeout: { read: 10000 }

// Complex operations
timeout: { write: 30000 }

// File uploads
timeout: { write: 60000 }
```

### Cache Configuration Guidelines

```typescript
// Static content (5 minutes)
cache: { maxAge: 300, visibility: 'public' }

// User-specific content (1 minute)
cache: { maxAge: 60, visibility: 'private' }

// Real-time data (15 seconds)
cache: { maxAge: 15, visibility: 'private' }

// No cache (critical updates)
cache: { noCache: true }
```

## Observability

### Distributed Tracing

All requests are automatically traced with OpenTelemetry:

```typescript
// Tracing is automatic - every request gets:
// - Unique request ID
// - Parent/child span relationships
// - Timing information
// - Error tracking

// Access trace ID in context
const logger = loggerFromContext(context);
logger.info('Processing', { traceId: context.requestId });
```

### Metrics

Built-in Prometheus metrics:

- `http_requests_total` - Total request count by method, path, status
- `http_request_duration_seconds` - Request duration histogram
- `http_requests_active` - Active request gauge
- `circuit_breaker_state` - Circuit breaker state by service
- `retry_attempts_total` - Retry attempt count by service

Access metrics endpoint:
```
GET /api/metrics
```

### Logging

All routes automatically log:
- Request start (method, path, user agent, IP)
- Request completion (status, duration)
- Request errors (error details, stack traces)

Custom logging:
```typescript
const logger = loggerFromContext(context);

logger.info('Order created', { orderId: '123', amount: 99.99 });
logger.warn('Slow response detected', { duration: 5000 });
logger.error('Payment failed', { error, orderId: '123' });
```

## Best Practices

### 1. Always Use Middleware Composition

**Don't:**
```typescript
export const POST = createRouteHandler(async (request, context) => {
  // Inline auth check
  const session = await auth();
  if (!session) return apiUnauthorized();

  // Inline validation
  const body = await request.json();
  if (!body.email) return apiValidationError('Email required');

  // Handler logic
  return apiSuccess({ data: body });
});
```

**Do:**
```typescript
export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ body: schema }),
    async (request, context) => {
      const body = context.validatedData.body;
      return apiSuccess({ data: body });
    }
  )
);
```

### 2. Leverage Common Schemas

**Don't:**
```typescript
const querySchema = z.object({
  page: z.coerce.number().min(1),
  limit: z.coerce.number().min(1).max(100),
});
```

**Do:**
```typescript
import { paginationSchema } from '@patina/api-routes';

const querySchema = paginationSchema.extend({
  status: z.enum(['active', 'inactive']).optional(),
});
```

### 3. Set Appropriate Cache Headers

**Don't:**
```typescript
// No caching for static product catalog
return apiSuccess({ products });
```

**Do:**
```typescript
// Cache for 5 minutes with 1 minute SWR
return apiSuccess(
  { products },
  undefined,
  {
    cache: {
      ttl: 300,
      swr: 60,
      visibility: 'public',
    },
  }
);
```

### 4. Use Type-Safe Validated Data

**Don't:**
```typescript
const body = await request.json();
const email = body.email as string; // Unsafe type assertion
```

**Do:**
```typescript
compose(
  withValidation({ body: z.object({ email: z.string().email() }) }),
  async (request, context) => {
    const { email } = context.validatedData.body; // Fully typed
  }
)
```

### 5. Order Middleware Correctly

Middleware executes top to bottom:

```typescript
compose(
  withAuth(auth),              // 1. First - authenticate
  requireRole('admin'),        // 2. Then - authorize
  withValidation({ body }),    // 3. Then - validate
  async (request, context) => { // 4. Finally - handle
    // Handler logic
  }
)
```

### 6. Handle Critical Operations Carefully

**Payment/Order Creation (no retry):**
```typescript
return proxyToBackend(request, context, {
  service: { name: 'orders', baseUrl: ORDERS_URL },
  retry: { maxRetries: 1 }, // No retry to prevent double-charging
});
```

**File Uploads (long timeout, no retry):**
```typescript
return proxyToBackend(request, context, {
  service: { name: 'media', baseUrl: MEDIA_URL },
  retry: { maxRetries: 1 }, // No retry to prevent duplicate uploads
  timeout: { write: 60000 }, // 60 seconds for large files
});
```

### 7. Create Service-Specific Proxy Handlers

```typescript
// lib/proxies/catalog.ts
import { createProxyHandler } from '@patina/api-routes';

export const catalogProxy = createProxyHandler(
  'catalog',
  process.env.CATALOG_SERVICE_URL!,
  {
    retry: { maxRetries: 3 },
    timeout: { read: 10000, write: 30000 },
    circuitBreaker: { failureThreshold: 5 },
  }
);

// app/api/catalog/products/route.ts
import { catalogProxy } from '@/lib/proxies/catalog';

export const GET = createRouteHandler(
  compose(withAuth(auth), catalogProxy),
  { method: 'GET' }
);
```

## Troubleshooting

### Module Not Found Errors

**Error:** `Cannot find module '@patina/api-routes'`

**Solution:**
```bash
# Rebuild shared packages
pnpm --filter @patina/api-routes build

# Or rebuild everything
pnpm build
```

### Type Errors After Validation

**Error:** `Property 'body' does not exist on type 'RouteContext'`

**Solution:** Ensure middleware order is correct:
```typescript
compose(
  withValidation({ body: schema }), // Must come BEFORE handler
  async (request, context) => {
    const body = context.validatedData.body; // Now available
  }
)
```

### Authentication Failures

**Error:** `401 Unauthorized` on protected routes

**Solutions:**
1. Verify `withAuth` middleware is applied
2. Check NextAuth configuration
3. Ensure session is valid
4. Verify backend JWT validation

### Circuit Breaker Open

**Error:** `503 Service Unavailable` - Circuit breaker open

**Solutions:**
1. Check backend service health
2. Verify network connectivity
3. Review circuit breaker metrics
4. Increase `failureThreshold` or `resetTimeout`

### Request Timeouts

**Error:** `504 Gateway Timeout`

**Solutions:**
1. Increase timeout for operation type
2. Optimize backend service performance
3. Check for network latency
4. Consider async processing for long operations

### High Retry Rates

**Symptoms:** Increased latency, duplicate operations

**Solutions:**
1. Investigate backend service reliability
2. Reduce `maxRetries`
3. Disable retry for mutations (`shouldRetryMutation: false`)
4. Increase timeout to reduce false timeouts

## TypeScript

The package is fully typed with TypeScript. Key features:

- **Type Inference:** Zod schemas automatically infer types for validated data
- **Context Typing:** `RouteContext` is fully typed throughout middleware chain
- **Middleware Composition:** Type-safe middleware chaining
- **Response Types:** All response helpers return properly typed `Response` objects

Example with full type inference:
```typescript
const schema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
});

compose(
  withValidation({ body: schema }),
  async (request, context) => {
    // TypeScript knows the exact type:
    // { email: string, age: number }
    const { email, age } = context.validatedData.body;
  }
)
```

## Contributing

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migrating existing routes.

See [EXAMPLES.md](./EXAMPLES.md) for comprehensive usage examples.

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed troubleshooting.

## Related Documentation

- [Proxy Middleware](./PROXY_MIDDLEWARE.md) - Deep dive on backend proxying
- [Circuit Breaker](./CIRCUIT_BREAKER.md) - Circuit breaker pattern documentation
- [Retry Logic](./src/utils/retry.ts) - Retry implementation details

## License

MIT
