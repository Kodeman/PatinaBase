# @patina/api-routes Examples

Comprehensive code examples for every use case. All examples are production-ready and can be copied directly into your project.

## Table of Contents

1. [Authentication Routes](#1-authentication-routes)
2. [CRUD Operations](#2-crud-operations)
3. [Nested Resources](#3-nested-resources)
4. [File Operations](#4-file-operations)
5. [Caching Strategies](#5-caching-strategies)
6. [Error Handling](#6-error-handling)
7. [Custom Middleware](#7-custom-middleware)
8. [Observability](#8-observability)
9. [Advanced Patterns](#9-advanced-patterns)
10. [Real-World Examples](#10-real-world-examples)

---

## 1. Authentication Routes

### Example 1.1: Login Route

```typescript
// app/api/auth/login/route.ts
import { createRouteHandler, compose, withValidation, proxyToBackend } from '@patina/api-routes';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const USER_MGMT_URL = process.env.USER_MANAGEMENT_SERVICE_URL!;

export const POST = createRouteHandler(
  compose(
    withValidation({ body: loginSchema }),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MGMT_URL,
          path: '/auth/login',
        },
        requireAuth: false, // Login doesn't require auth
        retry: { maxRetries: 2 }, // Limited retry for login
        timeout: { write: 10000 }, // 10 second timeout
      });
    }
  ),
  { method: 'POST', path: '/api/auth/login' }
);
```

### Example 1.2: Register Route

```typescript
// app/api/auth/register/route.ts
import { createRouteHandler, compose, withValidation, proxyToBackend } from '@patina/api-routes';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['designer', 'client']),
});

const USER_MGMT_URL = process.env.USER_MANAGEMENT_SERVICE_URL!;

export const POST = createRouteHandler(
  compose(
    withValidation({ body: registerSchema }),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MGMT_URL,
          path: '/auth/register',
        },
        requireAuth: false,
        retry: { maxRetries: 1 }, // No retry for registration
        timeout: { write: 15000 },
      });
    }
  ),
  { method: 'POST', path: '/api/auth/register' }
);
```

### Example 1.3: Logout Route

```typescript
// app/api/auth/logout/route.ts
import { createRouteHandler, compose, withAuth, apiSuccess } from '@patina/api-routes';
import { auth } from '@/lib/auth';

export const POST = createRouteHandler(
  compose(
    withAuth(auth), // Verify user is authenticated
    async (request, context) => {
      // NextAuth handles session cleanup
      // You could also notify backend to invalidate tokens
      return apiSuccess({ message: 'Logged out successfully' });
    }
  ),
  { method: 'POST', path: '/api/auth/logout' }
);
```

### Example 1.4: Session Route

```typescript
// app/api/auth/session/route.ts
import { createRouteHandler, compose, withAuth, apiSuccess } from '@patina/api-routes';
import { auth } from '@/lib/auth';

export const GET = createRouteHandler(
  compose(
    withAuth(auth, { required: false }), // Optional auth
    async (request, context) => {
      if (!context.user) {
        return apiSuccess({ session: null });
      }

      return apiSuccess({
        session: {
          user: {
            id: context.user.id,
            email: context.user.email,
            name: context.user.name,
            role: context.user.role,
          },
        },
      });
    }
  ),
  { method: 'GET', path: '/api/auth/session' }
);
```

### Example 1.5: Password Reset

```typescript
// app/api/auth/reset-password/route.ts
import { createRouteHandler, compose, withValidation, proxyToBackend } from '@patina/api-routes';
import { z } from 'zod';

const resetSchema = z.object({
  email: z.string().email(),
});

const USER_MGMT_URL = process.env.USER_MANAGEMENT_SERVICE_URL!;

export const POST = createRouteHandler(
  compose(
    withValidation({ body: resetSchema }),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MGMT_URL,
          path: '/auth/reset-password',
        },
        requireAuth: false,
        retry: { maxRetries: 2 },
      });
    }
  ),
  { method: 'POST', path: '/api/auth/reset-password' }
);
```

---

## 2. CRUD Operations

### Example 2.1: List Resources (GET)

```typescript
// app/api/catalog/products/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, paginationSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;

const querySchema = paginationSchema.extend({
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['price', 'name', 'date']).default('date'),
});

export const GET = createRouteHandler(
  compose(
    withAuth(auth, { required: false }), // Optional auth for public catalog
    withValidation({ query: querySchema }),
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
        cache: {
          maxAge: 300, // 5 minutes
          staleWhileRevalidate: 60,
          visibility: 'public',
        },
      });
    }
  ),
  { method: 'GET', path: '/api/catalog/products' }
);
```

### Example 2.2: Get Single Resource (GET)

```typescript
// app/api/catalog/products/[id]/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, uuidParamSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth, { required: false }),
    withValidation({ params: uuidParamSchema }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: `/api/v1/products/${id}`,
        },
        requireAuth: false,
        retry: { maxRetries: 3 },
        cache: { maxAge: 300, visibility: 'public' },
      });
    }
  ),
  { method: 'GET', path: '/api/catalog/products/[id]' }
);
```

### Example 2.3: Create Resource (POST)

```typescript
// app/api/catalog/products/route.ts (continued)
import { createRouteHandler, compose, withAuth, requireRole, withValidation, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000),
  price: z.number().positive(),
  category: z.string().uuid(),
  brand: z.string().min(1),
  sku: z.string().min(1),
  stock: z.number().min(0).default(0),
  images: z.array(z.string().url()).optional(),
  tags: z.array(z.string()).optional(),
  dimensions: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    unit: z.enum(['cm', 'in']),
  }).optional(),
});

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    requireRole('designer'), // Only designers can create products
    withValidation({ body: createProductSchema }),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: '/api/v1/products',
        },
        retry: { maxRetries: 2 },
        timeout: { write: 30000 },
      });
    }
  ),
  { method: 'POST', path: '/api/catalog/products' }
);
```

### Example 2.4: Update Resource (PUT)

```typescript
// app/api/catalog/products/[id]/route.ts (continued)
import { z } from 'zod';

const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  price: z.number().positive().optional(),
  stock: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
});

export const PUT = createRouteHandler(
  compose(
    withAuth(auth),
    requireRole('designer'),
    withValidation({
      params: uuidParamSchema,
      body: updateProductSchema,
    }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: `/api/v1/products/${id}`,
        },
        retry: {
          maxRetries: 2,
          shouldRetryMutation: true, // PUT is idempotent
        },
        timeout: { write: 30000 },
      });
    }
  ),
  { method: 'PUT', path: '/api/catalog/products/[id]' }
);
```

### Example 2.5: Delete Resource (DELETE)

```typescript
// app/api/catalog/products/[id]/route.ts (continued)
export const DELETE = createRouteHandler(
  compose(
    withAuth(auth),
    requireRole('designer'),
    withValidation({ params: uuidParamSchema }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: `/api/v1/products/${id}`,
        },
        retry: {
          maxRetries: 2,
          shouldRetryMutation: true, // DELETE is idempotent
        },
        timeout: { delete: 15000 },
      });
    }
  ),
  { method: 'DELETE', path: '/api/catalog/products/[id]' }
);
```

### Example 2.6: Multi-Method Handler

```typescript
// app/api/catalog/collections/route.ts
import { createMultiMethodHandler, withAuth, requireRole, withValidation, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;

const createCollectionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['manual', 'dynamic']),
  productIds: z.array(z.string().uuid()).optional(),
  rules: z.object({
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
  }).optional(),
});

const { GET, POST } = createMultiMethodHandler({
  middleware: [withAuth(auth)],
  handlers: {
    GET: async (request, context) => {
      return proxyToBackend(request, context, {
        service: { name: 'catalog', baseUrl: CATALOG_URL },
        retry: { maxRetries: 3 },
        cache: { maxAge: 60 },
      });
    },
    POST: compose(
      requireRole('designer'),
      withValidation({ body: createCollectionSchema }),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: { name: 'catalog', baseUrl: CATALOG_URL },
          retry: { maxRetries: 2 },
        });
      }
    ),
  },
  config: { path: '/api/catalog/collections' },
});

export { GET, POST };
```

---

## 3. Nested Resources

### Example 3.1: Project Tasks

```typescript
// app/api/projects/[id]/tasks/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, uuidParamSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL!;

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

// GET /api/projects/:id/tasks
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
        cache: { maxAge: 30 }, // 30 seconds
      });
    }
  ),
  { method: 'GET', path: '/api/projects/[id]/tasks' }
);

// POST /api/projects/:id/tasks
export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({
      params: uuidParamSchema,
      body: createTaskSchema,
    }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${id}/tasks`,
        },
        retry: { maxRetries: 2 },
      });
    }
  ),
  { method: 'POST', path: '/api/projects/[id]/tasks' }
);
```

### Example 3.2: Thread Messages

```typescript
// app/api/comms/threads/[id]/messages/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, uuidParamSchema, paginationSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const COMMS_URL = process.env.COMMS_SERVICE_URL!;

const createMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  attachments: z.array(z.string().url()).optional(),
});

// GET /api/comms/threads/:id/messages
export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({
      params: uuidParamSchema,
      query: paginationSchema,
    }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${id}/messages`,
        },
        retry: { maxRetries: 3 },
        cache: { maxAge: 15, visibility: 'private' }, // 15 seconds
      });
    }
  ),
  { method: 'GET', path: '/api/comms/threads/[id]/messages' }
);

// POST /api/comms/threads/:id/messages
export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({
      params: uuidParamSchema,
      body: createMessageSchema,
    }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${id}/messages`,
        },
        retry: { maxRetries: 1 }, // Don't retry message creation
        timeout: { write: 15000 },
      });
    }
  ),
  { method: 'POST', path: '/api/comms/threads/[id]/messages' }
);
```

### Example 3.3: Multi-Level Nesting

```typescript
// app/api/projects/[projectId]/milestones/[milestoneId]/deliverables/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL!;

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
});

const deliverableSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  fileUrl: z.string().url().optional(),
});

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ params: paramsSchema }),
    async (request, context) => {
      const { projectId, milestoneId } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/milestones/${milestoneId}/deliverables`,
        },
        retry: { maxRetries: 3 },
        cache: { maxAge: 60 },
      });
    }
  ),
  { method: 'GET' }
);

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({
      params: paramsSchema,
      body: deliverableSchema,
    }),
    async (request, context) => {
      const { projectId, milestoneId } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/milestones/${milestoneId}/deliverables`,
        },
        retry: { maxRetries: 2 },
      });
    }
  ),
  { method: 'POST' }
);
```

---

## 4. File Operations

### Example 4.1: File Upload

```typescript
// app/api/media/upload/route.ts
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
        retry: { maxRetries: 1 }, // No retry for uploads
        timeout: { write: 60000 }, // 60 seconds for large files
      });
    }
  ),
  { method: 'POST', path: '/api/media/upload' }
);
```

### Example 4.2: File Download

```typescript
// app/api/media/files/[id]/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, uuidParamSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const MEDIA_URL = process.env.MEDIA_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ params: uuidParamSchema }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'media',
          baseUrl: MEDIA_URL,
          path: `/api/v1/files/${id}`,
        },
        retry: { maxRetries: 2 },
        timeout: { read: 30000 },
        cache: {
          maxAge: 3600, // Cache for 1 hour
          visibility: 'private',
        },
      });
    }
  ),
  { method: 'GET', path: '/api/media/files/[id]' }
);
```

### Example 4.3: Image Processing

```typescript
// app/api/media/images/[id]/resize/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, uuidParamSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const MEDIA_URL = process.env.MEDIA_SERVICE_URL!;

const resizeSchema = z.object({
  width: z.coerce.number().min(1).max(4000),
  height: z.coerce.number().min(1).max(4000),
  quality: z.coerce.number().min(1).max(100).default(85),
  format: z.enum(['jpeg', 'png', 'webp']).default('jpeg'),
});

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({
      params: uuidParamSchema,
      body: resizeSchema,
    }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'media',
          baseUrl: MEDIA_URL,
          path: `/api/v1/images/${id}/resize`,
        },
        retry: { maxRetries: 1 }, // No retry for processing
        timeout: { write: 45000 }, // 45 seconds for image processing
      });
    }
  ),
  { method: 'POST', path: '/api/media/images/[id]/resize' }
);
```

---

## 5. Caching Strategies

### Example 5.1: Short-Lived Cache (15 seconds - Cart)

```typescript
// app/api/orders/cart/route.ts
import { createRouteHandler, compose, withAuth, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: '/api/v1/cart',
        },
        retry: { maxRetries: 3 },
        cache: {
          maxAge: 15, // 15 seconds
          visibility: 'private',
        },
      });
    }
  ),
  { method: 'GET', path: '/api/orders/cart' }
);
```

### Example 5.2: Medium Cache (1 minute - Projects)

```typescript
// app/api/projects/route.ts
import { createRouteHandler, compose, withAuth, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: '/api/v1/projects',
        },
        retry: { maxRetries: 3 },
        cache: {
          maxAge: 60, // 1 minute
          staleWhileRevalidate: 30,
          visibility: 'private',
        },
      });
    }
  ),
  { method: 'GET', path: '/api/projects' }
);
```

### Example 5.3: Long Cache (5 minutes - Catalog)

```typescript
// app/api/catalog/products/route.ts
import { createRouteHandler, compose, proxyToBackend } from '@patina/api-routes';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;

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
      cache: {
        maxAge: 300, // 5 minutes
        staleWhileRevalidate: 120, // 2 minutes
        visibility: 'public', // Public cache
      },
    });
  },
  { method: 'GET', path: '/api/catalog/products' }
);
```

### Example 5.4: No Cache (Critical Updates)

```typescript
// app/api/orders/checkout/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL!;

const checkoutSchema = z.object({
  paymentMethod: z.enum(['card', 'bank']),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),
});

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ body: checkoutSchema }),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: '/api/v1/checkout',
        },
        retry: { maxRetries: 1 }, // No retry for checkout
        timeout: { write: 30000 },
        cache: { noCache: true }, // No caching for payments
      });
    }
  ),
  { method: 'POST', path: '/api/orders/checkout' }
);
```

### Example 5.5: Conditional Cache

```typescript
// app/api/catalog/search/route.ts
import { createRouteHandler, compose, withValidation, proxyToBackend } from '@patina/api-routes';
import { z } from 'zod';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;

const searchSchema = z.object({
  q: z.string().min(3),
  cache: z.enum(['true', 'false']).default('true'),
});

export const GET = createRouteHandler(
  compose(
    withValidation({ query: searchSchema }),
    async (request, context) => {
      const { q, cache: shouldCache } = context.validatedData.query;

      return proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: '/api/v1/search',
        },
        requireAuth: false,
        retry: { maxRetries: 3 },
        cache: shouldCache === 'true'
          ? { maxAge: 180, visibility: 'public' }
          : { noCache: true },
      });
    }
  ),
  { method: 'GET', path: '/api/catalog/search' }
);
```

---

## 6. Error Handling

### Example 6.1: Custom Error Mapping

```typescript
// app/api/orders/[id]/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, uuidParamSchema } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ params: uuidParamSchema }),
    async (request, context) => {
      const { id } = context.validatedData.params;

      return proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/orders/${id}`,
        },
        retry: { maxRetries: 3 },
        errorMapping: {
          404: {
            code: 'ORDER_NOT_FOUND',
            message: 'The requested order could not be found',
          },
          409: {
            code: 'ORDER_ALREADY_PROCESSED',
            message: 'This order has already been processed and cannot be modified',
          },
          422: {
            code: 'ORDER_INVALID_STATE',
            message: 'Order is in an invalid state for this operation',
          },
        },
      });
    }
  ),
  { method: 'GET', path: '/api/orders/[id]' }
);
```

### Example 6.2: Service-Specific Errors

```typescript
// app/api/payments/charge/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, apiError } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL!;

const chargeSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.enum(['USD', 'EUR', 'GBP']),
});

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ body: chargeSchema }),
    async (request, context) => {
      try {
        return await proxyToBackend(request, context, {
          service: {
            name: 'orders',
            baseUrl: ORDERS_URL,
            path: '/api/v1/payments/charge',
          },
          retry: { maxRetries: 1 }, // No retry for payments
          timeout: { write: 30000 },
          errorMapping: {
            402: {
              code: 'PAYMENT_FAILED',
              message: 'Payment could not be processed',
            },
            409: {
              code: 'PAYMENT_DUPLICATE',
              message: 'This payment has already been processed',
            },
          },
        });
      } catch (error) {
        // Additional error handling for payment failures
        const logger = loggerFromContext(context);
        logger.error('Payment processing failed', {
          error,
          orderId: context.validatedData.body.orderId,
        });
        throw error;
      }
    }
  ),
  { method: 'POST', path: '/api/payments/charge' }
);
```

### Example 6.3: Graceful Degradation

```typescript
// app/api/catalog/recommendations/route.ts
import { createRouteHandler, compose, withAuth, apiSuccess, apiError } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth, { required: false }),
    async (request, context) => {
      try {
        // Try to get personalized recommendations
        const response = await fetch(`${CATALOG_URL}/api/v1/recommendations`, {
          headers: context.user
            ? { Authorization: `Bearer ${context.user.accessToken}` }
            : {},
        });

        if (!response.ok) {
          throw new Error('Recommendations service failed');
        }

        const data = await response.json();
        return apiSuccess(data);
      } catch (error) {
        // Fallback to popular products
        const fallbackResponse = await fetch(
          `${CATALOG_URL}/api/v1/products?sort=popular&limit=10`
        );

        if (!fallbackResponse.ok) {
          return apiError(error);
        }

        const fallbackData = await fallbackResponse.json();
        return apiSuccess({
          ...fallbackData,
          fallback: true,
          message: 'Showing popular products',
        });
      }
    }
  ),
  { method: 'GET', path: '/api/catalog/recommendations' }
);
```

---

## 7. Custom Middleware

### Example 7.1: Rate Limiting Middleware

```typescript
// lib/middleware/with-rate-limit.ts
import type { RouteHandler } from '@patina/api-routes';
import { apiRateLimitExceeded } from '@patina/api-routes';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function withRateLimit(options: {
  maxRequests: number;
  windowMs: number;
}) {
  return function middleware(next: RouteHandler): RouteHandler {
    return async (request, context) => {
      const key = context.user?.id || context.ip;
      const now = Date.now();

      const current = rateLimitStore.get(key);

      if (current && current.resetAt > now) {
        if (current.count >= options.maxRequests) {
          const retryAfter = Math.ceil((current.resetAt - now) / 1000);
          return apiRateLimitExceeded(retryAfter);
        }
        current.count++;
      } else {
        rateLimitStore.set(key, {
          count: 1,
          resetAt: now + options.windowMs,
        });
      }

      return next(request, context);
    };
  };
}

// Usage
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withRateLimit({ maxRequests: 10, windowMs: 60000 }), // 10 requests per minute
    async (request, context) => {
      return apiSuccess({ data: 'success' });
    }
  )
);
```

### Example 7.2: Request Logging Middleware

```typescript
// lib/middleware/with-request-logger.ts
import type { RouteHandler } from '@patina/api-routes';
import { loggerFromContext } from '@patina/api-routes';

export function withRequestLogger(options?: { logBody?: boolean }) {
  return function middleware(next: RouteHandler): RouteHandler {
    return async (request, context) => {
      const logger = loggerFromContext(context);

      logger.info('Request received', {
        method: request.method,
        url: request.url,
        userAgent: context.userAgent,
        userId: context.user?.id,
      });

      if (options?.logBody && request.method !== 'GET') {
        try {
          const clone = request.clone();
          const body = await clone.json();
          logger.debug('Request body', { body });
        } catch (error) {
          // Body not JSON, skip logging
        }
      }

      const response = await next(request, context);

      logger.info('Request completed', {
        status: response.status,
        duration: Date.now() - context.startTime,
      });

      return response;
    };
  };
}
```

### Example 7.3: Response Transformation Middleware

```typescript
// lib/middleware/with-response-transform.ts
import type { RouteHandler } from '@patina/api-routes';

export function withResponseTransform<T>(
  transformer: (data: any) => T
) {
  return function middleware(next: RouteHandler): RouteHandler {
    return async (request, context) => {
      const response = await next(request, context);

      // Only transform successful JSON responses
      if (response.status < 300 && response.headers.get('content-type')?.includes('json')) {
        const data = await response.json();
        const transformed = transformer(data);

        return new Response(JSON.stringify(transformed), {
          status: response.status,
          headers: response.headers,
        });
      }

      return response;
    };
  };
}

// Usage
export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    withResponseTransform((data) => ({
      success: true,
      timestamp: new Date().toISOString(),
      data,
    })),
    async (request, context) => {
      return apiSuccess({ items: [] });
    }
  )
);
```

---

## 8. Observability

### Example 8.1: Custom Metrics

```typescript
// app/api/analytics/track/route.ts
import { createRouteHandler, compose, withAuth, withValidation, apiSuccess } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { loggerFromContext } from '@patina/api-routes';

const trackSchema = z.object({
  event: z.string(),
  properties: z.record(z.any()).optional(),
});

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ body: trackSchema }),
    async (request, context) => {
      const { event, properties } = context.validatedData.body;
      const logger = loggerFromContext(context);

      // Log event with structured data
      logger.info('Analytics event tracked', {
        event,
        properties,
        userId: context.user!.id,
        timestamp: new Date().toISOString(),
      });

      // You could also send to analytics service here

      return apiSuccess({ tracked: true });
    }
  ),
  { method: 'POST', path: '/api/analytics/track' }
);
```

### Example 8.2: Performance Monitoring

```typescript
// lib/middleware/with-performance-monitoring.ts
import type { RouteHandler } from '@patina/api-routes';
import { loggerFromContext, getRequestDuration } from '@patina/api-routes';

export function withPerformanceMonitoring(options?: {
  slowThresholdMs?: number;
}) {
  const slowThreshold = options?.slowThresholdMs || 5000;

  return function middleware(next: RouteHandler): RouteHandler {
    return async (request, context) => {
      const startTime = Date.now();
      const logger = loggerFromContext(context);

      const response = await next(request, context);

      const duration = Date.now() - startTime;

      if (duration > slowThreshold) {
        logger.warn('Slow request detected', {
          duration,
          threshold: slowThreshold,
          url: request.url,
          method: request.method,
          userId: context.user?.id,
        });
      }

      // Add performance header
      response.headers.set('X-Response-Time', `${duration}ms`);

      return response;
    };
  };
}
```

### Example 8.3: Circuit Breaker Monitoring

```typescript
// lib/monitoring/circuit-breaker-monitor.ts
import { getCircuitBreaker } from '@patina/api-routes';

// Monitor all services
const services = ['catalog', 'orders', 'projects', 'comms', 'user-management'];

services.forEach(serviceName => {
  const breaker = getCircuitBreaker(serviceName);

  breaker.onStateChange((oldState, newState, metrics) => {
    console.error(`Circuit breaker ${serviceName}: ${oldState} → ${newState}`, {
      failures: metrics.failures,
      successes: metrics.successes,
      totalRequests: metrics.totalRequests,
      uptime: metrics.uptime,
    });

    // Send alert to monitoring service (Sentry, DataDog, etc.)
    if (newState === 'OPEN') {
      // Alert: service is down
      sendAlert({
        level: 'critical',
        message: `Circuit breaker opened for ${serviceName}`,
        metrics,
      });
    } else if (newState === 'CLOSED' && oldState === 'HALF_OPEN') {
      // Info: service recovered
      sendAlert({
        level: 'info',
        message: `Circuit breaker closed for ${serviceName} - service recovered`,
        metrics,
      });
    }
  });
});

function sendAlert(alert: any) {
  // Send to monitoring service
  console.log('Alert:', alert);
}
```

---

## 9. Advanced Patterns

### Example 9.1: Reusable Service Proxy

```typescript
// lib/proxies/catalog.ts
import { createProxyHandler } from '@patina/api-routes';

export const catalogProxy = createProxyHandler(
  'catalog',
  process.env.CATALOG_SERVICE_URL!,
  {
    retry: { maxRetries: 3 },
    timeout: { read: 10000, write: 30000 },
    circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 },
    cache: { maxAge: 300, visibility: 'public' },
  }
);

// app/api/catalog/products/route.ts
import { createRouteHandler, compose, withAuth } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { catalogProxy } from '@/lib/proxies/catalog';

export const GET = createRouteHandler(
  compose(
    withAuth(auth, { required: false }),
    catalogProxy
  ),
  { method: 'GET', path: '/api/catalog/products' }
);
```

### Example 9.2: Response Transformation

```typescript
// app/api/search/opensearch/route.ts
import { createRouteHandler, compose, withValidation, proxyToBackend } from '@patina/api-routes';
import { z } from 'zod';

const SEARCH_URL = process.env.SEARCH_SERVICE_URL!;

const searchSchema = z.object({
  q: z.string().min(3),
  page: z.coerce.number().min(1).default(1),
});

export const GET = createRouteHandler(
  compose(
    withValidation({ query: searchSchema }),
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'search',
          baseUrl: SEARCH_URL,
          path: '/api/v1/search',
        },
        requireAuth: false,
        retry: { maxRetries: 3 },
        // Transform OpenSearch response to simpler format
        responseTransformer: {
          transform: (data: any) => ({
            results: data.hits?.hits?.map((hit: any) => ({
              id: hit._id,
              score: hit._score,
              ...hit._source,
            })) || [],
            total: data.hits?.total?.value || 0,
            maxScore: data.hits?.max_score,
            took: data.took,
          }),
        },
      });
    }
  ),
  { method: 'GET', path: '/api/search/opensearch' }
);
```

### Example 9.3: Aggregation from Multiple Services

```typescript
// app/api/dashboard/summary/route.ts
import { createRouteHandler, compose, withAuth, apiSuccess } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL!;
const ORDERS_URL = process.env.ORDERS_SERVICE_URL!;
const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL!;

export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    async (request, context) => {
      const token = context.user!.accessToken;
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch data from multiple services in parallel
      const [products, orders, projects] = await Promise.all([
        fetch(`${CATALOG_URL}/api/v1/products/count`, { headers })
          .then(r => r.json())
          .catch(() => ({ count: 0 })),
        fetch(`${ORDERS_URL}/api/v1/orders/summary`, { headers })
          .then(r => r.json())
          .catch(() => ({ total: 0, revenue: 0 })),
        fetch(`${PROJECTS_URL}/api/v1/projects/stats`, { headers })
          .then(r => r.json())
          .catch(() => ({ active: 0, completed: 0 })),
      ]);

      return apiSuccess({
        products: products.count,
        orders: orders.total,
        revenue: orders.revenue,
        activeProjects: projects.active,
        completedProjects: projects.completed,
      });
    }
  ),
  { method: 'GET', path: '/api/dashboard/summary' }
);
```

---

## 10. Real-World Examples

### Example 10.1: E-Commerce Checkout Flow

```typescript
// app/api/orders/checkout/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { loggerFromContext } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL!;

const checkoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().min(1),
    price: z.number().positive(),
  })).min(1),
  payment: z.object({
    method: z.enum(['card', 'bank']),
    token: z.string(),
  }),
  shipping: z.object({
    name: z.string(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string(),
    }),
    method: z.enum(['standard', 'express', 'overnight']),
  }),
  billing: z.object({
    sameAsShipping: z.boolean(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string(),
    }).optional(),
  }),
});

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({ body: checkoutSchema }),
    async (request, context) => {
      const logger = loggerFromContext(context);

      logger.info('Checkout initiated', {
        userId: context.user!.id,
        itemCount: context.validatedData.body.items.length,
      });

      try {
        return await proxyToBackend(request, context, {
          service: {
            name: 'orders',
            baseUrl: ORDERS_URL,
            path: '/api/v1/checkout',
          },
          retry: { maxRetries: 1 }, // NO RETRY for checkout
          timeout: { write: 30000 },
          cache: { noCache: true },
          errorMapping: {
            402: {
              code: 'PAYMENT_FAILED',
              message: 'Payment could not be processed. Please try again.',
            },
            409: {
              code: 'CHECKOUT_CONFLICT',
              message: 'This order has already been processed.',
            },
            422: {
              code: 'INVENTORY_UNAVAILABLE',
              message: 'Some items are no longer available.',
            },
          },
        });
      } catch (error) {
        logger.error('Checkout failed', {
          error,
          userId: context.user!.id,
        });
        throw error;
      }
    }
  ),
  { method: 'POST', path: '/api/orders/checkout' }
);
```

### Example 10.2: Project Management Workflow

```typescript
// app/api/projects/[id]/submit-for-review/route.ts
import { createRouteHandler, compose, withAuth, withValidation, proxyToBackend, uuidParamSchema, apiSuccess } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL!;
const COMMS_URL = process.env.COMMS_SERVICE_URL!;

const submitSchema = z.object({
  notes: z.string().optional(),
  attachments: z.array(z.string().url()).optional(),
});

export const POST = createRouteHandler(
  compose(
    withAuth(auth),
    withValidation({
      params: uuidParamSchema,
      body: submitSchema,
    }),
    async (request, context) => {
      const { id } = context.validatedData.params;
      const token = context.user!.accessToken;

      // 1. Update project status
      const projectResponse = await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${id}/submit`,
        },
        retry: { maxRetries: 2 },
      });

      if (!projectResponse.ok) {
        return projectResponse;
      }

      // 2. Create notification thread
      try {
        await fetch(`${COMMS_URL}/api/v1/threads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId: id,
            subject: 'Project Submitted for Review',
            message: context.validatedData.body.notes || 'Project ready for review',
          }),
        });
      } catch (error) {
        // Log but don't fail if notification fails
        console.error('Failed to create notification:', error);
      }

      return apiSuccess({
        message: 'Project submitted for review',
        projectId: id,
      });
    }
  ),
  { method: 'POST', path: '/api/projects/[id]/submit-for-review' }
);
```

### Example 10.3: Multi-Tenant API

```typescript
// lib/middleware/with-tenant.ts
import type { RouteHandler } from '@patina/api-routes';
import { apiForbidden } from '@patina/api-routes';

export function withTenant() {
  return function middleware(next: RouteHandler): RouteHandler {
    return async (request, context) => {
      // Extract tenant from subdomain or header
      const url = new URL(request.url);
      const subdomain = url.hostname.split('.')[0];

      // Or get from header
      const tenantHeader = request.headers.get('X-Tenant-ID');

      const tenantId = tenantHeader || subdomain;

      // Verify user has access to this tenant
      if (context.user && context.user.tenantId !== tenantId) {
        return apiForbidden('Access denied to this tenant');
      }

      // Add tenant to context
      context.custom = {
        ...context.custom,
        tenantId,
      };

      // Add tenant header for backend
      const response = await next(request, context);
      response.headers.set('X-Tenant-ID', tenantId);

      return response;
    };
  };
}

// Usage
export const GET = createRouteHandler(
  compose(
    withAuth(auth),
    withTenant(),
    async (request, context) => {
      const tenantId = context.custom?.tenantId;
      return apiSuccess({ tenantId, data: [] });
    }
  )
);
```

---

These examples cover the full spectrum of use cases for `@patina/api-routes`. Each example is production-ready and demonstrates best practices for reliability, security, and observability.

For more information:
- [README.md](./README.md) - Complete API reference
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Step-by-step migration
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues and solutions
