# Migration Guide

Migrate your Next.js API routes from raw `fetch()` to `@patina/api-routes` middleware for improved reliability, maintainability, and observability.

## Table of Contents

- [Why Migrate?](#why-migrate)
- [Before and After](#before-and-after)
- [Step-by-Step Migration](#step-by-step-migration)
- [Migration Patterns](#migration-patterns)
- [Migration Checklist](#migration-checklist)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Why Migrate?

### Benefits of Migration

**Reliability**
- Automatic retry with exponential backoff
- Circuit breaker pattern for failing services
- Configurable timeouts per operation type
- Graceful error handling

**Security**
- Automatic auth token forwarding
- Role-based access control
- Request validation with Zod
- Standardized error messages (no sensitive data leaks)

**Observability**
- Distributed tracing with correlation IDs
- Prometheus metrics collection
- Structured logging
- Circuit breaker metrics

**Developer Experience**
- Composable middleware pattern
- Type-safe request validation
- Consistent error format
- Reduced boilerplate code

**Performance**
- Response caching with stale-while-revalidate
- Request deduplication
- Connection pooling
- Smart retry strategies

## Before and After

### Before: Raw fetch()

```typescript
// app/api/products/route.ts
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Manual auth check
    const session = await auth();
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Manual URL building
    const url = new URL(request.url);
    const backendUrl = `${process.env.CATALOG_SERVICE_URL}/api/v1/products${url.search}`;

    // Manual header building
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${session.accessToken}`);
    headers.set('Content-Type', 'application/json');

    // No retry, no circuit breaker, no timeout
    const response = await fetch(backendUrl, { headers });

    if (!response.ok) {
      // Manual error handling
      const error = await response.json();
      return Response.json(
        { error: error.message || 'Failed to fetch products' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Manual cache headers
    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    // Generic error handling
    console.error('Error fetching products:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Problems with this approach:**
- 60+ lines of boilerplate
- No retry on transient failures
- No circuit breaker protection
- No timeout handling
- No request tracing
- No metrics collection
- Manual error transformation
- Inconsistent error format
- No type safety

### After: With @patina/api-routes

```typescript
// app/api/products/route.ts
import { createRouteHandler, compose, withAuth, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3011';

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: '/api/v1/products',
        },
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 300, staleWhileRevalidate: 60 },
      });
    }
  ),
  { method: 'GET', path: '/api/products' }
);
```

**Benefits:**
- 24 lines (60% reduction)
- Automatic retry with exponential backoff
- Circuit breaker protection
- 10-second timeout
- Distributed tracing
- Prometheus metrics
- Standardized error format
- Type-safe throughout

## Step-by-Step Migration

### Step 1: Install Package

```bash
pnpm add @patina/api-routes
```

Ensure peer dependencies are installed:
```bash
pnpm add next@^15.0.0 next-auth@5.0.0-beta.29 zod@^3.22.4
```

### Step 2: Identify Routes to Migrate

Start with high-traffic or critical routes:

```bash
# Find all route files
find apps/*/src/app/api -name "route.ts"

# Or use grep to find routes using fetch
grep -r "fetch(" apps/*/src/app/api
```

Prioritize routes that:
1. Call backend microservices
2. Have authentication requirements
3. Need retry logic
4. Would benefit from caching

### Step 3: Update Route File

Transform your route handler using the appropriate pattern:

**Pattern A: Simple Proxy (no validation)**
```typescript
// Before
export async function GET(request: NextRequest) {
  const response = await fetch(`${BACKEND_URL}/endpoint`);
  return Response.json(await response.json());
}

// After
export const GET = createRouteHandler(
  async (request, context) => {
    return proxyToBackend(request, context, {
      service: { name: 'service', baseUrl: BACKEND_URL },
    });
  }
);
```

**Pattern B: With Authentication**
```typescript
// Before
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of handler
}

// After
export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      // context.user is available
    }
  )
);
```

**Pattern C: With Validation**
```typescript
// Before
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.email || !body.name) {
    return Response.json({ error: 'Validation failed' }, { status: 400 });
  }
  // ... rest of handler
}

// After
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const POST = createRouteHandler(
  compose(
    withValidation({ body: schema }),
    async (request, context) => {
      const { email, name } = context.validatedData.body;
      // Fully typed and validated
    }
  )
);
```

### Step 4: Configure Service URL

Add environment variable for backend service:

```bash
# .env.local
CATALOG_SERVICE_URL=http://localhost:3011
ORDERS_SERVICE_URL=http://localhost:3015
PROJECTS_SERVICE_URL=http://localhost:3016
```

**Important:** Do NOT use `NEXT_PUBLIC_` prefix—service URLs should be server-side only.

### Step 5: Configure Retry and Timeout

Choose appropriate configuration based on operation type:

```typescript
// Read operations (GET, HEAD)
retry: { maxRetries: 3 }
timeout: { read: 10000 }

// Idempotent writes (PUT)
retry: { maxRetries: 2, shouldRetryMutation: true }
timeout: { write: 30000 }

// Critical operations (POST orders, payments)
retry: { maxRetries: 1 } // No retry
timeout: { write: 30000 }

// File uploads
retry: { maxRetries: 1 }
timeout: { write: 60000 }
```

### Step 6: Test Endpoint

Test the migrated endpoint:

```bash
# Start services
pnpm dev:designer

# Test endpoint
curl http://localhost:3000/api/products

# With authentication
curl -H "Cookie: next-auth.session-token=..." http://localhost:3000/api/products
```

Verify:
- Response format is correct
- Authentication works
- Validation works
- Error handling is appropriate

### Step 7: Update Tests

Update tests to use new API route format:

```typescript
// Before
import { GET } from './route';

it('should return products', async () => {
  const request = new NextRequest('http://localhost/api/products');
  const response = await GET(request);
  const data = await response.json();
  expect(data).toHaveLength(10);
});

// After (same test structure, but more behavior to test)
it('should return products with retry', async () => {
  const request = new NextRequest('http://localhost/api/products');
  const response = await GET(request);
  const data = await response.json();

  expect(data).toHaveLength(10);
  expect(response.headers.get('Cache-Control')).toContain('max-age=300');
});
```

### Step 8: Deploy

Deploy changes following your standard process:

```bash
# Build
pnpm build

# Test
pnpm test

# Deploy
./infra/scripts/deploy-all.sh dev
```

Monitor:
- Error rates
- Response times
- Circuit breaker state
- Cache hit rates

## Migration Patterns

### Pattern 1: Auth Routes

**Before:**
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Manual validation
  if (!body.email || !body.password) {
    return Response.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Call backend
  const response = await fetch(`${USER_MGMT_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return Response.json({ error: 'Login failed' }, { status: 401 });
  }

  return Response.json(await response.json());
}
```

**After:**
```typescript
import { createRouteHandler, compose, withValidation, proxyToBackend } from '@patina/api-routes';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const POST = createRouteHandler(
  compose(
    withValidation({ body: loginSchema }),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: process.env.USER_MANAGEMENT_SERVICE_URL!,
          path: '/auth/login',
        },
        requireAuth: false,
        retry: { maxRetries: 2 },
      });
    }
  ),
  { method: 'POST', path: '/api/auth/login' }
);
```

### Pattern 2: CRUD Routes

**Before:**
```typescript
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';

  const response = await fetch(
    `${CATALOG_URL}/api/v1/products?page=${page}&limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }
  );

  return Response.json(await response.json());
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'designer') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  const response = await fetch(`${CATALOG_URL}/api/v1/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return Response.json(await response.json());
}
```

**After:**
```typescript
import { createMultiMethodHandler, withAuth, requireRole, withValidation, proxyToBackend, paginationSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;

const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  description: z.string().optional(),
});

const { GET, POST } = createMultiMethodHandler({
  handlers: {
    GET: compose(
      withAuth(auth),
      withValidation({ query: paginationSchema }),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: { name: 'catalog', baseUrl: CATALOG_URL },
          retry: { maxRetries: 3 },
          cache: { maxAge: 60 },
        });
      }
    ),
    POST: compose(
      withAuth(auth),
      requireRole('designer'),
      withValidation({ body: createProductSchema }),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: { name: 'catalog', baseUrl: CATALOG_URL },
          retry: { maxRetries: 2 },
        });
      }
    ),
  },
});

export { GET, POST };
```

### Pattern 3: Nested Resources

**Before:**
```typescript
// app/api/projects/[id]/tasks/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;

  const response = await fetch(
    `${PROJECTS_URL}/api/v1/projects/${id}/tasks`,
    {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }
  );

  return Response.json(await response.json());
}
```

**After:**
```typescript
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, uuidParamSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ params: uuidParamSchema }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${id}/tasks`,
        },
        retry: { maxRetries: 3 },
        cache: { maxAge: 30 },
      });
    }
  ),
  { method: 'GET', path: '/api/projects/[id]/tasks' }
);
```

### Pattern 4: File Uploads

**Before:**
```typescript
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();

  const response = await fetch(`${MEDIA_URL}/api/v1/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: formData,
  });

  return Response.json(await response.json());
}
```

**After:**
```typescript
import { createRouteHandler, compose, withAuth, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const MEDIA_URL = process.env.MEDIA_SERVICE_URL!;

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'media',
          baseUrl: MEDIA_URL,
          path: '/api/v1/upload',
        },
        retry: { maxRetries: 1 }, // No retry for file uploads
        timeout: { write: 60000 }, // 60 seconds for large files
      });
    }
  ),
  { method: 'POST', path: '/api/media/upload' }
);
```

### Pattern 5: Custom Business Logic

**Before:**
```typescript
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch data from multiple services
  const [products, orders] = await Promise.all([
    fetch(`${CATALOG_URL}/api/v1/products`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }).then(r => r.json()),
    fetch(`${ORDERS_URL}/api/v1/orders`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }).then(r => r.json()),
  ]);

  // Custom business logic
  const recommendations = products.filter(p =>
    orders.some(o => o.productId === p.id)
  );

  return Response.json({ recommendations });
}
```

**After:**
```typescript
import { createRouteHandler, compose, withAuth, apiSuccess } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;
const ORDERS_URL = process.env.ORDERS_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      // Use native fetch for custom logic
      const token = context.user!.accessToken;

      const [products, orders] = await Promise.all([
        fetch(`${CATALOG_URL}/api/v1/products`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()),
        fetch(`${ORDERS_URL}/api/v1/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()),
      ]);

      const recommendations = products.filter(p =>
        orders.some(o => o.productId === p.id)
      );

      return apiSuccess({ recommendations });
    }
  ),
  { method: 'GET', path: '/api/recommendations' }
);
```

## Migration Checklist

Use this checklist for each route migration:

### Pre-Migration
- [ ] Identify route to migrate
- [ ] Document current behavior
- [ ] Review existing error handling
- [ ] Note any custom headers or logic
- [ ] Check if route needs authentication
- [ ] Check if route needs authorization
- [ ] Check if route needs validation

### Migration
- [ ] Install @patina/api-routes package
- [ ] Import necessary functions
- [ ] Replace handler with createRouteHandler
- [ ] Add authentication middleware (if needed)
- [ ] Add authorization middleware (if needed)
- [ ] Add validation middleware (if needed)
- [ ] Configure retry strategy
- [ ] Configure timeout
- [ ] Configure cache (if applicable)
- [ ] Add environment variable for service URL
- [ ] Test locally

### Post-Migration
- [ ] Verify response format matches original
- [ ] Test authentication flow
- [ ] Test authorization flow
- [ ] Test validation errors
- [ ] Test error handling
- [ ] Update tests
- [ ] Update API documentation
- [ ] Monitor metrics in staging
- [ ] Deploy to production
- [ ] Monitor error rates
- [ ] Monitor response times

## Common Patterns

### Environment Variable Configuration

Create a centralized config file:

```typescript
// lib/config/services.ts
export const serviceUrls = {
  catalog: process.env.CATALOG_SERVICE_URL || 'http://localhost:3011',
  orders: process.env.ORDERS_SERVICE_URL || 'http://localhost:3015',
  projects: process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016',
  comms: process.env.COMMS_SERVICE_URL || 'http://localhost:3017',
  userManagement: process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010',
};

// Use in routes
import { serviceUrls } from '@/lib/config/services';

return proxyToBackend(request, context, {
  service: { name: 'catalog', baseUrl: serviceUrls.catalog },
});
```

### Reusable Proxy Handlers

Create service-specific proxy handlers:

```typescript
// lib/proxies/catalog.ts
import { createProxyHandler } from '@patina/api-routes';
import { serviceUrls } from '@/lib/config/services';

export const catalogProxy = createProxyHandler(
  'catalog',
  serviceUrls.catalog,
  {
    retry: { maxRetries: 3 },
    timeout: { read: 10000, write: 30000 },
    circuitBreaker: { failureThreshold: 5 },
    cache: { maxAge: 300 },
  }
);

// Use in routes
import { catalogProxy } from '@/lib/proxies/catalog';

export const GET = createRouteHandler(
  compose(withAuth(auth), catalogProxy),
  { method: 'GET' }
);
```

### Common Validation Schemas

Create reusable schemas:

```typescript
// lib/schemas/common.ts
import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(3),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Use in routes
import { searchQuerySchema } from '@/lib/schemas/common';

withValidation({ query: searchQuerySchema })
```

## Troubleshooting

### Issue: Module Not Found

**Error:**
```
Cannot find module '@patina/api-routes'
```

**Solution:**
```bash
# Rebuild package
pnpm --filter @patina/api-routes build

# Reinstall dependencies
pnpm install
```

### Issue: Type Errors

**Error:**
```
Property 'validatedData' does not exist on type 'RouteContext'
```

**Solution:**
Ensure middleware order is correct:
```typescript
compose(
  withValidation({ body: schema }), // Must come BEFORE handler
  async (request, context) => {
    const body = context.validatedData.body;
  }
)
```

### Issue: Authentication Not Working

**Error:**
```
401 Unauthorized
```

**Solutions:**
1. Verify NextAuth is configured correctly
2. Check `withAuth` middleware is applied
3. Verify session contains `accessToken`
4. Check backend JWT validation

### Issue: Backend Not Receiving Requests

**Symptoms:**
- Frontend returns 502/503 errors
- Backend logs show no requests

**Solutions:**
1. Verify service URL environment variable
2. Check backend service is running
3. Verify network connectivity
4. Check circuit breaker state

### Issue: Validation Errors

**Error:**
```
400 Bad Request - Validation failed
```

**Solutions:**
1. Check Zod schema matches request data
2. Use `z.coerce` for query parameters
3. Make optional fields `.optional()`
4. Test schema independently

### Issue: Performance Degradation

**Symptoms:**
- Slower response times after migration

**Solutions:**
1. Reduce retry count
2. Decrease timeout values
3. Enable response caching
4. Check circuit breaker isn't triggering frequently

### Issue: Duplicate Operations

**Symptoms:**
- Orders created twice
- Payments charged twice

**Solution:**
Disable retry for non-idempotent operations:
```typescript
retry: { maxRetries: 1 } // No retry
```

## Next Steps

After migration:

1. **Monitor Metrics** - Check Prometheus for error rates, latency, circuit breaker state
2. **Review Logs** - Verify structured logging is working
3. **Optimize Configuration** - Fine-tune retry, timeout, cache based on observed behavior
4. **Document** - Update API documentation with new patterns
5. **Train Team** - Share migration guide with team members

## Support

For additional help:
- Review [README.md](./README.md) for comprehensive API reference
- Check [EXAMPLES.md](./EXAMPLES.md) for more code examples
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed debugging
- Consult [PROXY_MIDDLEWARE.md](./PROXY_MIDDLEWARE.md) for proxy configuration
