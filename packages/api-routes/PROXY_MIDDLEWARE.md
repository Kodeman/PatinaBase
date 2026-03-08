# Backend Proxy Middleware

Enterprise-grade proxy middleware for routing Next.js API requests to NestJS backend microservices with built-in retry logic, circuit breaker pattern, authentication forwarding, and comprehensive error handling.

## Features

- **Retry Logic**: Exponential backoff with configurable retry strategies
- **Circuit Breaker**: Automatic failure detection and fast-fail for unhealthy services
- **Authentication**: Automatic JWT token forwarding from NextAuth sessions
- **Request ID Propagation**: Full request tracing across service boundaries
- **Error Handling**: Standardized error format with custom error code mapping
- **Response Transformation**: Transform backend responses to frontend format
- **Timeout Management**: Method-specific timeouts (read vs write operations)
- **Header Forwarding**: Automatic and custom header forwarding
- **Caching**: Configurable response caching with stale-while-revalidate
- **TypeScript**: Full type safety for configuration and responses

## Installation

```bash
pnpm add @patina/api-routes
```

## Quick Start

### Basic Proxy

```typescript
// app/api/catalog/products/route.ts
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
      });
    }
  ),
  { method: 'GET', path: '/api/catalog/products' }
);
```

### Reusable Proxy Handler

```typescript
// lib/proxies/catalog.ts
import { createProxyHandler } from '@patina/api-routes';

export const catalogProxy = createProxyHandler(
  'catalog',
  process.env.CATALOG_SERVICE_URL!,
  {
    retry: { maxRetries: 3 },
    timeout: { read: 10000, write: 30000 },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 60000,
    },
  }
);

// app/api/catalog/products/route.ts
import { createRouteHandler, compose, withAuth } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { catalogProxy } from '@/lib/proxies/catalog';

export const GET = createRouteHandler(
  compose(withAuth(auth), catalogProxy),
  { method: 'GET', path: '/api/catalog/products' }
);
```

## Configuration

### ProxyConfig

Complete configuration interface:

```typescript
interface ProxyConfig {
  /** Backend service configuration */
  service: {
    /** Service name (used for circuit breaker identification) */
    name: string;
    /** Base URL of the backend service */
    baseUrl: string;
    /** Optional path override (default: use request URL path) */
    path?: string;
  };

  /** Retry configuration (merged with defaults) */
  retry?: {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;
    /** Initial delay in milliseconds (default: 1000) */
    initialDelay?: number;
    /** Maximum delay in milliseconds (default: 30000) */
    maxDelay?: number;
    /** Exponential backoff multiplier (default: 2) */
    backoffMultiplier?: number;
    /** HTTP status codes that should trigger a retry */
    retryableStatuses?: number[];
    /** Whether to retry mutation requests (default: false) */
    shouldRetryMutation?: boolean;
  };

  /** Circuit breaker configuration (merged with defaults) */
  circuitBreaker?: {
    /** Number of consecutive failures before opening circuit (default: 5) */
    failureThreshold?: number;
    /** Number of consecutive successes to close circuit (default: 2) */
    successThreshold?: number;
    /** Time in ms to wait before transitioning from OPEN to HALF_OPEN (default: 60000) */
    resetTimeout?: number;
    /** Number of concurrent test requests allowed in HALF_OPEN state (default: 1) */
    halfOpenRequests?: number;
  };

  /** Timeout configuration (merged with defaults) */
  timeout?: {
    /** Default timeout for all requests (default: 30000ms) */
    default?: number;
    /** Timeout for read operations (GET, HEAD) (default: 10000ms) */
    read?: number;
    /** Timeout for write operations (POST, PUT, PATCH) (default: 60000ms) */
    write?: number;
    /** Timeout for delete operations (default: 30000ms) */
    delete?: number;
  };

  /** Whether authentication is required (default: true) */
  requireAuth?: boolean;

  /** Additional headers to forward from client request */
  forwardHeaders?: string[];

  /** Custom error code mappings for this service */
  errorMapping?: {
    [statusCode: number]: {
      code: string;
      message: string;
    };
  };

  /** Optional response transformer */
  responseTransformer?: {
    transform: (data: any, response: Response) => any;
  };

  /** Cache configuration for successful responses */
  cache?: {
    /** Cache TTL in seconds */
    ttl?: number;
    /** Stale-while-revalidate window in seconds */
    swr?: number;
    /** Whether the cache is public or private */
    visibility?: 'public' | 'private';
    /** Disable caching entirely */
    noCache?: boolean;
  };
}
```

## Usage Examples

### 1. Retry Configuration

Enable retries for transient failures:

```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'catalog',
    baseUrl: process.env.CATALOG_SERVICE_URL!,
  },
  retry: {
    maxRetries: 3,
    initialDelay: 1000, // Start with 1 second
    maxDelay: 30000, // Cap at 30 seconds
    backoffMultiplier: 2, // Double each time
    shouldRetryMutation: false, // Don't retry POST/PUT/PATCH
  },
});
```

### 2. Circuit Breaker Protection

Protect against cascading failures:

```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'media',
    baseUrl: process.env.MEDIA_SERVICE_URL!,
  },
  circuitBreaker: {
    failureThreshold: 3, // Open after 3 failures
    successThreshold: 2, // Close after 2 successes
    resetTimeout: 30000, // Try again after 30 seconds
  },
});
```

### 3. Custom Error Mapping

Map backend errors to domain-specific codes:

```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'orders',
    baseUrl: process.env.ORDERS_SERVICE_URL!,
  },
  errorMapping: {
    404: {
      code: 'ORDER_NOT_FOUND',
      message: 'The requested order could not be found',
    },
    409: {
      code: 'ORDER_ALREADY_PROCESSED',
      message: 'This order has already been processed',
    },
  },
});
```

### 4. Response Transformation

Transform backend responses to frontend format:

```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'search',
    baseUrl: process.env.SEARCH_SERVICE_URL!,
  },
  responseTransformer: {
    transform: (data: any) => ({
      results: data.hits?.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source,
      })),
      total: data.total?.value || 0,
      hasMore: data.total?.value > (data.hits?.length || 0),
    }),
  },
});
```

### 5. Public Endpoints (No Auth)

Create public endpoints with caching:

```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'catalog',
    baseUrl: process.env.CATALOG_SERVICE_URL!,
  },
  requireAuth: false, // Allow unauthenticated access
  cache: {
    ttl: 300, // Cache for 5 minutes
    visibility: 'public',
    swr: 600, // Stale-while-revalidate for 10 minutes
  },
});
```

### 6. Custom Header Forwarding

Forward additional headers for tracing:

```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'projects',
    baseUrl: process.env.PROJECTS_SERVICE_URL!,
  },
  forwardHeaders: [
    'x-correlation-id',
    'x-trace-id',
    'accept-language',
    'x-timezone',
  ],
});
```

### 7. Method-Specific Timeouts

Configure different timeouts per operation type:

```typescript
return proxyToBackend(request, context, {
  service: {
    name: 'catalog',
    baseUrl: process.env.CATALOG_SERVICE_URL!,
  },
  timeout: {
    read: 10000, // 10s for GET/HEAD
    write: 30000, // 30s for POST/PUT/PATCH
    delete: 15000, // 15s for DELETE
  },
});
```

## How It Works

### Request Flow

```
1. Client Request → Next.js API Route
2. Authentication Check (if requireAuth=true)
3. Circuit Breaker State Check
   └── If OPEN → Return 503 immediately
4. Build Backend Request
   ├── Extract path, query, headers, body
   ├── Add Authorization header
   ├── Add X-Request-Id, X-Forwarded-* headers
   └── Build complete URL
5. Execute Request (with retry + circuit breaker)
   ├── Apply timeout based on method
   ├── Retry on transient failures
   └── Update circuit breaker state
6. Process Response
   ├── Handle errors (map to ApiError format)
   ├── Transform response (if transformer provided)
   └── Apply cache headers
7. Return Standardized Response
```

### Circuit Breaker States

```
CLOSED (Normal)
  └── Consecutive failures reach threshold
      ↓
OPEN (Fast-fail)
  └── Reset timeout expires
      ↓
HALF_OPEN (Testing)
  ├── Successes reach threshold → CLOSED
  └── Any failure → OPEN
```

### Retry Strategy

- **GET/HEAD**: Automatically retried (idempotent operations)
- **POST/PUT/PATCH/DELETE**: Only retried if `shouldRetryMutation: true`
- **Retryable Status Codes**: 408, 429, 500, 502, 503, 504
- **Backoff**: Exponential with jitter to prevent thundering herd
- **Retry-After**: Honors `Retry-After` header for 429 responses

### Authentication Flow

1. Extract user from `context.user` (added by `withAuth` middleware)
2. Get access token from user session
3. Add `Authorization: Bearer {token}` header
4. Forward to backend service
5. Backend validates JWT token

## Error Handling

All errors are transformed to standardized `ApiError` format:

```typescript
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Human-readable error message',
    timestamp: '2024-01-01T00:00:00.000Z',
    details?: {
      // Additional context
      requestId: 'req-123',
      serviceName: 'catalog',
      attempts: 3,
      status: 500
    }
  }
}
```

### Error Types

- **AUTHENTICATION_FAILED** (401): Missing or invalid authentication
- **AUTHORIZATION_FAILED** (403): Insufficient permissions
- **NOT_FOUND** (404): Resource not found
- **BAD_REQUEST** (400): Invalid request data
- **TIMEOUT** (504): Request exceeded timeout
- **SERVICE_UNAVAILABLE** (503): Circuit breaker open or service down
- **NETWORK_ERROR** (502): Network/connectivity issues
- **INTERNAL_ERROR** (500): Unexpected errors

## Best Practices

### 1. Service-Specific Configuration

Create reusable proxy handlers per service:

```typescript
// lib/proxies/index.ts
export const catalogProxy = createProxyHandler('catalog', process.env.CATALOG_SERVICE_URL!, {
  retry: { maxRetries: 3 },
  timeout: { read: 10000, write: 30000 },
});

export const ordersProxy = createProxyHandler('orders', process.env.ORDERS_SERVICE_URL!, {
  retry: { maxRetries: 2, shouldRetryMutation: false },
  timeout: { write: 60000 }, // Long timeout for order processing
  circuitBreaker: { failureThreshold: 3 },
});
```

### 2. Environment Variables

Use environment variables for service URLs:

```bash
# .env.local
CATALOG_SERVICE_URL=http://localhost:3011
ORDERS_SERVICE_URL=http://localhost:3015
PROJECTS_SERVICE_URL=http://localhost:3016
```

### 3. Error Monitoring

Log circuit breaker state changes:

```typescript
import { getCircuitBreaker } from '@patina/api-routes';

const breaker = getCircuitBreaker('catalog');
breaker.onStateChange((oldState, newState, metrics) => {
  console.error(`Circuit breaker ${oldState} → ${newState}`, metrics);
  // Send to monitoring service (Sentry, DataDog, etc.)
});
```

### 4. Testing

Mock the backend service in tests:

```typescript
import { proxyToBackend } from '@patina/api-routes';

vi.mock('global.fetch');

it('should proxy request successfully', async () => {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );

  const response = await proxyToBackend(request, context, config);
  expect(response.status).toBe(200);
});
```

## Performance Considerations

### Default Timeouts

- **Read operations (GET, HEAD)**: 10 seconds
- **Write operations (POST, PUT, PATCH)**: 60 seconds
- **Delete operations**: 30 seconds

Adjust based on your service SLAs.

### Circuit Breaker Thresholds

- **Failure threshold**: 5 consecutive failures (conservative)
- **Reset timeout**: 60 seconds (balance between recovery and load)
- **Half-open requests**: 1 (minimize load during recovery)

Tune based on service reliability and load patterns.

### Retry Configuration

- **Max retries**: 3 (balance between resilience and latency)
- **Initial delay**: 1 second
- **Max delay**: 30 seconds
- **Backoff multiplier**: 2 (exponential backoff)

Be conservative with retries to avoid amplifying load on struggling services.

## Troubleshooting

### Circuit Breaker Stuck Open

**Symptoms**: All requests failing with 503 "Service temporarily unavailable"

**Solutions**:
1. Check backend service health
2. Verify network connectivity
3. Inspect circuit breaker metrics
4. Reduce `failureThreshold` or increase `resetTimeout`

### Request Timeouts

**Symptoms**: Requests failing with 504 "Request timed out"

**Solutions**:
1. Increase timeout for specific method type
2. Optimize backend service performance
3. Check for network latency issues
4. Consider async processing for long-running operations

### Authentication Failures

**Symptoms**: 401 "Authentication required" errors

**Solutions**:
1. Verify `withAuth` middleware is applied
2. Check NextAuth configuration
3. Ensure access token is in user session
4. Verify backend JWT validation

### High Retry Rates

**Symptoms**: Increased latency, duplicate operations

**Solutions**:
1. Investigate backend service reliability
2. Reduce `maxRetries` or disable for mutations
3. Increase timeout to reduce false timeouts
4. Check for network issues

## Related Documentation

- [Retry Logic](./src/utils/retry.ts)
- [Circuit Breaker](./src/utils/circuit-breaker.ts)
- [Error Transformer](./src/utils/error-transformer.ts)
- [Response Wrapper](./src/utils/response-wrapper.ts)
- [Usage Examples](./src/middleware/proxy-to-backend.example.ts)

## License

MIT
