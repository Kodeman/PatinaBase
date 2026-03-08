# Troubleshooting Guide

Comprehensive troubleshooting guide for `@patina/api-routes`. This guide covers common issues, their causes, and detailed solutions.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [TypeScript Errors](#typescript-errors)
3. [Authentication Issues](#authentication-issues)
4. [Validation Errors](#validation-errors)
5. [Circuit Breaker Issues](#circuit-breaker-issues)
6. [Timeout Errors](#timeout-errors)
7. [Retry Issues](#retry-issues)
8. [Cache Problems](#cache-problems)
9. [Backend Connection Issues](#backend-connection-issues)
10. [Performance Issues](#performance-issues)
11. [Deployment Issues](#deployment-issues)

---

## Installation Issues

### Issue: Module Not Found

**Error:**
```
Cannot find module '@patina/api-routes'
```

**Causes:**
- Package not installed
- Build artifacts missing
- Incorrect import path
- TypeScript build cache issues

**Solutions:**

**Solution 1: Rebuild the package**
```bash
# Navigate to package directory
cd packages/api-routes

# Clean and rebuild
pnpm clean
pnpm build

# Or rebuild from root
pnpm --filter @patina/api-routes build
```

**Solution 2: Reinstall dependencies**
```bash
# From repository root
pnpm clean:cache
pnpm install

# Rebuild all packages
pnpm build
```

**Solution 3: Check import path**
```typescript
// ✅ Correct
import { createRouteHandler } from '@patina/api-routes';

// ❌ Incorrect
import { createRouteHandler } from 'api-routes';
import { createRouteHandler } from '@patina/api-routes/src';
```

### Issue: Peer Dependency Warnings

**Error:**
```
warning "@patina/api-routes" has unmet peer dependency "next@>=15.0.0"
```

**Solution:**
```bash
# Install missing peer dependencies
pnpm add next@^15.0.0 next-auth@5.0.0-beta.29 zod@^3.22.4
```

### Issue: Build Fails with "No inputs found"

**Error:**
```
Error: [tsup] No inputs were found for "src/**/*.ts"
```

**Causes:**
- Source files missing
- Incorrect tsconfig.json configuration
- Wrong working directory

**Solution:**
```bash
# Verify source files exist
ls packages/api-routes/src

# Check tsup.config.ts
cat packages/api-routes/tsup.config.ts

# Rebuild with verbose logging
cd packages/api-routes
pnpm build --verbose
```

---

## TypeScript Errors

### Issue: Property 'validatedData' does not exist on type 'RouteContext'

**Error:**
```typescript
Property 'validatedData' does not exist on type 'RouteContext'
```

**Cause:**
Middleware order is incorrect. The handler is trying to access `validatedData` before `withValidation` middleware runs.

**Solution:**
```typescript
// ❌ Wrong order
compose(
  async (request, context) => {
    const body = context.validatedData.body; // Error!
  },
  withValidation({ body: schema })
)

// ✅ Correct order
compose(
  withValidation({ body: schema }), // Middleware must come FIRST
  async (request, context) => {
    const body = context.validatedData.body; // Works!
  }
)
```

### Issue: Type 'unknown' is not assignable

**Error:**
```typescript
Type 'unknown' is not assignable to type 'ProductData'
```

**Cause:**
TypeScript cannot infer the type from Zod schema validation.

**Solution:**

**Option 1: Use type assertion (not recommended)**
```typescript
const body = context.validatedData.body as ProductData;
```

**Option 2: Infer type from schema (recommended)**
```typescript
import { z } from 'zod';

const productSchema = z.object({
  name: z.string(),
  price: z.number(),
});

type ProductData = z.infer<typeof productSchema>;

compose(
  withValidation({ body: productSchema }),
  async (request, context) => {
    const body = context.validatedData.body as ProductData;
    // Now fully typed
  }
)
```

**Option 3: Use direct access (simplest)**
```typescript
compose(
  withValidation({ body: productSchema }),
  async (request, context) => {
    const { name, price } = context.validatedData.body;
    // TypeScript infers types from schema
  }
)
```

### Issue: Cannot find name 'RouteHandler'

**Error:**
```typescript
Cannot find name 'RouteHandler'
```

**Solution:**
```typescript
// Import the type
import type { RouteHandler } from '@patina/api-routes';

function myMiddleware(next: RouteHandler): RouteHandler {
  return async (request, context) => {
    return next(request, context);
  };
}
```

---

## Authentication Issues

### Issue: 401 Unauthorized on Protected Routes

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Authentication required"
  }
}
```

**Causes:**
1. Missing `withAuth` middleware
2. NextAuth session not valid
3. Token not in request
4. Backend JWT validation failing

**Solutions:**

**Solution 1: Verify middleware is applied**
```typescript
// ❌ Missing auth
export const GET = createRouteHandler(
  async (request, context) => {
    // No withAuth!
  }
);

// ✅ With auth
export const GET = createRouteHandler(
  compose(
    withAuth(auth), // Add this
    async (request, context) => {
      // context.user is available
    }
  )
);
```

**Solution 2: Check NextAuth configuration**
```typescript
// auth.ts
import NextAuth from 'next-auth';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Your providers
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken; // Ensure token is set
      }
      return token;
    },
    async session({ session, token }) {
      session.user.accessToken = token.accessToken; // Add to session
      return session;
    },
  },
});
```

**Solution 3: Verify session exists**
```bash
# Test session endpoint
curl -b cookies.txt http://localhost:3000/api/auth/session

# Should return user data
```

**Solution 4: Check backend token validation**
```bash
# Test backend directly with token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3011/api/v1/products
```

### Issue: User Role Not Available

**Error:**
```
Cannot read property 'role' of undefined
```

**Cause:**
User object doesn't have role property, or role middleware is incorrectly configured.

**Solution:**
```typescript
// Ensure role is added to session
// auth.ts
callbacks: {
  async session({ session, token }) {
    session.user.id = token.sub!;
    session.user.role = token.role; // Add role
    return session;
  },
}

// Use role middleware correctly
compose(
  withAuth(auth),
  requireRole('admin'), // Or withRole({ roles: 'admin' })
  async (request, context) => {
    console.log(context.user.role); // Now available
  }
)
```

### Issue: 403 Forbidden Despite Being Logged In

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "AUTHORIZATION_FAILED",
    "message": "Insufficient permissions"
  }
}
```

**Cause:**
User doesn't have required role.

**Solution:**
```typescript
// Check user role
compose(
  withAuth(auth),
  async (request, context) => {
    console.log('User role:', context.user?.role);

    // Debug role requirement
    if (!hasRole(context, 'admin')) {
      console.log('User is not admin');
    }

    // Or use less restrictive check
    if (hasAnyRole(context, ['admin', 'designer'])) {
      // User has at least one of these roles
    }
  }
)
```

---

## Validation Errors

### Issue: Validation Fails for Valid Data

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "field": "page",
      "message": "Expected number, received string"
    }
  }
}
```

**Cause:**
Query parameters are strings by default. Use `z.coerce` to convert.

**Solution:**
```typescript
// ❌ Wrong - expects number
const schema = z.object({
  page: z.number(), // Query params are strings!
});

// ✅ Correct - coerce to number
const schema = z.object({
  page: z.coerce.number().min(1),
  limit: z.coerce.number().min(1).max(100),
});
```

### Issue: Optional Fields Required

**Error:**
```
Required field 'description' is missing
```

**Cause:**
Field is not marked as optional in schema.

**Solution:**
```typescript
// ❌ Wrong
const schema = z.object({
  name: z.string(),
  description: z.string(), // Required!
});

// ✅ Correct
const schema = z.object({
  name: z.string(),
  description: z.string().optional(), // Optional
});
```

### Issue: UUID Validation Fails

**Error:**
```
Invalid UUID format
```

**Solution:**
```typescript
import { uuidParamSchema } from '@patina/api-routes';

// Use built-in schema
withValidation({ params: uuidParamSchema })

// Or create custom
const paramsSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});
```

---

## Circuit Breaker Issues

### Issue: Circuit Breaker Stuck Open

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service catalog is temporarily unavailable"
  }
}
```

**Symptoms:**
- All requests fail with 503
- Backend service is actually healthy
- Circuit breaker won't reset

**Causes:**
1. Failure threshold too low
2. Backend service was temporarily down
3. Reset timeout too long

**Solutions:**

**Solution 1: Check circuit breaker state**
```typescript
import { getCircuitBreaker } from '@patina/api-routes';

const breaker = getCircuitBreaker('catalog');
const metrics = breaker.getMetrics();

console.log('State:', breaker.getState()); // OPEN, HALF_OPEN, CLOSED
console.log('Metrics:', metrics);
// {
//   failures: 10,
//   successes: 0,
//   totalRequests: 10,
//   uptime: 95.5
// }
```

**Solution 2: Manually reset circuit breaker**
```typescript
// In emergency, reset manually
const breaker = getCircuitBreaker('catalog');
breaker.reset();
```

**Solution 3: Adjust thresholds**
```typescript
return proxyToBackend(request, context, {
  service: { name: 'catalog', baseUrl: CATALOG_URL },
  circuitBreaker: {
    failureThreshold: 10, // Increase from 5
    resetTimeout: 30000,  // Decrease from 60000
    successThreshold: 1,  // Decrease from 2
  },
});
```

**Solution 4: Monitor state changes**
```typescript
const breaker = getCircuitBreaker('catalog');

breaker.onStateChange((oldState, newState, metrics) => {
  console.log(`Circuit breaker: ${oldState} → ${newState}`, metrics);

  if (newState === 'OPEN') {
    // Alert team
    console.error('Circuit breaker opened!', metrics);
  }
});
```

### Issue: Circuit Breaker Opens Too Quickly

**Symptoms:**
- Circuit breaker opens after only a few failures
- Transient errors cause unnecessary downtime

**Solution:**
```typescript
// Increase failure threshold
circuitBreaker: {
  failureThreshold: 10, // More tolerant
  successThreshold: 3,  // Require more successes before closing
  resetTimeout: 30000,  // Try again sooner
}
```

---

## Timeout Errors

### Issue: 504 Gateway Timeout

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "TIMEOUT",
    "message": "Request to catalog timed out"
  }
}
```

**Causes:**
1. Backend service is slow
2. Timeout is too short
3. Network latency
4. Heavy computation

**Solutions:**

**Solution 1: Increase timeout**
```typescript
return proxyToBackend(request, context, {
  service: { name: 'catalog', baseUrl: CATALOG_URL },
  timeout: {
    read: 30000,  // Increase from 10000
    write: 60000, // Increase from 30000
  },
});
```

**Solution 2: Optimize backend**
```typescript
// Add database indexes
// Optimize queries
// Add caching layer
// Profile slow endpoints
```

**Solution 3: Use async processing for long operations**
```typescript
// Instead of waiting for result, return job ID
export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      // Start async job
      const jobId = await createProcessingJob(data);

      return apiSuccess({
        jobId,
        status: 'processing',
        statusUrl: `/api/jobs/${jobId}`,
      });
    }
  )
);
```

### Issue: Timeouts on File Uploads

**Error:**
```
Timeout after 30000ms
```

**Cause:**
Default write timeout is too short for large file uploads.

**Solution:**
```typescript
return proxyToBackend(request, context, {
  service: { name: 'media', baseUrl: MEDIA_URL },
  retry: { maxRetries: 1 }, // No retry for uploads
  timeout: { write: 120000 }, // 2 minutes for uploads
});
```

---

## Retry Issues

### Issue: Duplicate Operations from Retries

**Symptoms:**
- Orders created twice
- Payments charged twice
- Messages sent multiple times

**Cause:**
Retry enabled for non-idempotent operations.

**Solution:**
```typescript
// ❌ Wrong - retries payment
return proxyToBackend(request, context, {
  service: { name: 'orders', baseUrl: ORDERS_URL },
  retry: { maxRetries: 3 }, // Will retry payment!
});

// ✅ Correct - no retry
return proxyToBackend(request, context, {
  service: { name: 'orders', baseUrl: ORDERS_URL },
  retry: { maxRetries: 1 }, // No retry (1 attempt only)
});
```

### Issue: Too Many Retries Causing Delays

**Symptoms:**
- Slow response times
- Requests taking 10+ seconds
- Backend getting hammered

**Solution:**
```typescript
// Reduce retry count
retry: {
  maxRetries: 2,          // Reduce from 3
  initialDelay: 500,      // Reduce from 1000
  maxDelay: 15000,        // Reduce from 30000
  backoffMultiplier: 1.5, // Reduce from 2
}
```

### Issue: Retries Not Respecting Retry-After Header

**Cause:**
Custom retry configuration not checking `Retry-After` header.

**Solution:**
The built-in retry logic already respects `Retry-After` for 429 responses. Ensure you're not overriding it incorrectly.

```typescript
// The package handles this automatically for 429 responses
// No custom logic needed
```

---

## Cache Problems

### Issue: Stale Data Being Served

**Symptoms:**
- Updated data not showing
- Old product prices displayed
- Deleted items still appear

**Cause:**
Cache TTL is too long or SWR is keeping stale data alive.

**Solutions:**

**Solution 1: Reduce cache TTL**
```typescript
cache: {
  maxAge: 60,  // Reduce from 300
  staleWhileRevalidate: 15, // Reduce from 60
}
```

**Solution 2: Disable cache for specific routes**
```typescript
cache: {
  noCache: true,
}
```

**Solution 3: Invalidate cache after writes**
```typescript
// After update/delete
export const PUT = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      const response = await proxyToBackend(request, context, {
        service: { name: 'catalog', baseUrl: CATALOG_URL },
      });

      // Return with no-cache to force revalidation
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
  )
);
```

### Issue: Cache Not Working

**Symptoms:**
- Every request hits backend
- No performance improvement
- Cache-Control headers not set

**Causes:**
1. Cache disabled
2. Browser not caching
3. Incorrect visibility setting

**Solutions:**

**Solution 1: Verify cache configuration**
```typescript
// Ensure cache is configured
cache: {
  maxAge: 300,
  visibility: 'public', // Or 'private'
}
```

**Solution 2: Check response headers**
```bash
curl -I http://localhost:3000/api/catalog/products

# Should show:
# Cache-Control: public, max-age=300, stale-while-revalidate=60
```

**Solution 3: Use correct visibility**
```typescript
// For user-specific data
cache: { maxAge: 60, visibility: 'private' }

// For public data
cache: { maxAge: 300, visibility: 'public' }
```

---

## Backend Connection Issues

### Issue: ECONNREFUSED Error

**Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:3011
```

**Causes:**
1. Backend service not running
2. Wrong port
3. Wrong URL

**Solutions:**

**Solution 1: Verify backend is running**
```bash
# Check if service is running
curl http://localhost:3011/health

# Or check Docker containers
docker ps

# Or check processes
lsof -i :3011
```

**Solution 2: Verify environment variables**
```bash
# Check .env.local
cat .env.local | grep CATALOG_SERVICE_URL

# Should be:
# CATALOG_SERVICE_URL=http://localhost:3011
```

**Solution 3: Use correct URL format**
```typescript
// ✅ Correct
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3011';

// ❌ Wrong - missing protocol
const CATALOG_URL = 'localhost:3011';

// ❌ Wrong - trailing slash
const CATALOG_URL = 'http://localhost:3011/';
```

### Issue: DNS Resolution Failures

**Error:**
```
getaddrinfo ENOTFOUND catalog.local
```

**Cause:**
Service hostname cannot be resolved.

**Solution:**

**For development:**
```bash
# Add to /etc/hosts
127.0.0.1 catalog.local
127.0.0.1 orders.local
```

**For production:**
```bash
# Use correct production URLs
CATALOG_SERVICE_URL=https://catalog.patina.example.com
```

---

## Performance Issues

### Issue: Slow Response Times

**Symptoms:**
- Requests taking 2-5+ seconds
- High latency
- Poor user experience

**Causes:**
1. No caching
2. Too many retries
3. Slow backend
4. Network latency
5. Unnecessary middleware

**Solutions:**

**Solution 1: Add caching**
```typescript
cache: {
  maxAge: 300, // 5 minutes for static data
  staleWhileRevalidate: 60,
  visibility: 'public',
}
```

**Solution 2: Reduce retries**
```typescript
retry: {
  maxRetries: 2, // Reduce from 3
  initialDelay: 500, // Reduce from 1000
}
```

**Solution 3: Optimize timeout**
```typescript
timeout: {
  read: 5000, // Fail fast for reads
}
```

**Solution 4: Remove unnecessary middleware**
```typescript
// ❌ Too much middleware
compose(
  withAuth(auth),
  withRequestLogger(),
  withPerformanceMonitoring(),
  withCustomHeader(),
  withRateLimit(),
  // ... handler
)

// ✅ Only what's needed
compose(
  withAuth(auth),
  // ... handler
)
```

**Solution 5: Parallel requests**
```typescript
// ❌ Sequential
const products = await fetch(CATALOG_URL);
const orders = await fetch(ORDERS_URL);

// ✅ Parallel
const [products, orders] = await Promise.all([
  fetch(CATALOG_URL),
  fetch(ORDERS_URL),
]);
```

### Issue: High Memory Usage

**Symptoms:**
- Node.js process using lots of RAM
- Memory leaks
- OOM errors

**Causes:**
1. Circuit breaker metrics growing unbounded
2. Large request/response bodies
3. Memory leaks in middleware

**Solutions:**

**Solution 1: Limit circuit breaker history**
```typescript
// Circuit breakers store metrics in memory
// Reset periodically or use external storage
```

**Solution 2: Stream large responses**
```typescript
// For large file downloads, stream instead of buffering
```

---

## Deployment Issues

### Issue: Environment Variables Not Set

**Error:**
```
TypeError: Cannot read property 'split' of undefined
```

**Cause:**
Environment variables not set in production.

**Solution:**

**For Vercel:**
```bash
# Set in Vercel dashboard
# Or via CLI
vercel env add CATALOG_SERVICE_URL production
```

**For Docker:**
```yaml
# docker-compose.yml
environment:
  - CATALOG_SERVICE_URL=http://catalog:3011
  - ORDERS_SERVICE_URL=http://orders:3015
```

**For Kubernetes:**
```yaml
# deployment.yaml
env:
  - name: CATALOG_SERVICE_URL
    value: "http://catalog-service:3011"
```

### Issue: CORS Errors in Production

**Error:**
```
Access to fetch at 'https://api.example.com' from origin 'https://app.example.com' has been blocked by CORS
```

**Cause:**
Backend service not configured for CORS.

**Solution:**

**Backend (NestJS):**
```typescript
// main.ts
app.enableCors({
  origin: [
    'https://designer.patina.example.com',
    'https://client.patina.example.com',
  ],
  credentials: true,
});
```

### Issue: SSL/TLS Errors

**Error:**
```
Error: unable to verify the first certificate
```

**Cause:**
Self-signed certificates in staging/development.

**Solution:**

**For development only:**
```typescript
// ⚠️ NEVER in production
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

**For production:**
```bash
# Use proper SSL certificates
# Let's Encrypt, etc.
```

---

## Debugging Tips

### Enable Verbose Logging

```typescript
// Temporary debug logging
compose(
  withAuth(auth),
  async (request, context) => {
    console.log('Request:', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      user: context.user,
    });

    const response = await proxyToBackend(request, context, config);

    console.log('Response:', {
      status: response.status,
      headers: Object.fromEntries(response.headers),
    });

    return response;
  }
)
```

### Test Endpoints Directly

```bash
# Test frontend route
curl -v http://localhost:3000/api/catalog/products

# Test backend directly
curl -v http://localhost:3011/api/v1/products

# With auth
curl -v -H "Cookie: next-auth.session-token=..." \
  http://localhost:3000/api/catalog/products
```

### Monitor Circuit Breaker

```typescript
import { getCircuitBreaker } from '@patina/api-routes';

const services = ['catalog', 'orders', 'projects'];

services.forEach(name => {
  const breaker = getCircuitBreaker(name);

  setInterval(() => {
    console.log(`${name}:`, breaker.getMetrics());
  }, 5000);
});
```

---

## Getting Help

If you're still stuck:

1. **Check Documentation**
   - [README.md](./README.md)
   - [EXAMPLES.md](./EXAMPLES.md)
   - [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

2. **Enable Debug Logging**
   - Set `DEBUG=patina:*` environment variable
   - Check browser console
   - Check server logs

3. **Test in Isolation**
   - Test backend service directly
   - Test route without middleware
   - Test with minimal configuration

4. **Check Known Issues**
   - Review GitHub issues
   - Check changelog
   - Search discussions

5. **Create Minimal Reproduction**
   - Isolate the problem
   - Create minimal test case
   - Share code example

---

**Last Updated**: 2025-11-12
**Package Version**: 0.1.0
