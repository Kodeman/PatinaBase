# @patina/api-client

Centralized API client library for all Patina services. Provides typed HTTP clients with authentication, error handling, and response unwrapping.

## Features

- ✅ **Type-safe** - Full TypeScript support with typed requests and responses
- ✅ **Authentication** - Automatic token injection and refresh
- ✅ **Error handling** - Standardized error responses (401, 403, 429, 5xx)
- ✅ **Request tracing** - Automatic request ID generation
- ✅ **Response unwrapping** - Handles both wrapped and unwrapped API responses
- ✅ **Service clients** - Pre-built clients for all Patina microservices

## Installation

```bash
pnpm add @patina/api-client
```

## Usage

### Basic Usage

```typescript
import { CatalogApiClient } from '@patina/api-client';

// Create client instance
const catalogApi = new CatalogApiClient({
  baseURL: 'http://localhost:3011',
  timeout: 30000,
});

// Use the client
const products = await catalogApi.getProducts({ status: 'published' });
const product = await catalogApi.getProduct('product-id');
```

### With NextAuth (Recommended)

```typescript
import { CatalogApiClient } from '@patina/api-client';
import { getSession } from 'next-auth/react';

const catalogApi = new CatalogApiClient({
  baseURL: process.env.NEXT_PUBLIC_CATALOG_API_URL!,
  timeout: 30000,
  getSession: async () => {
    const session = await getSession();
    return session;
  },
  isDevelopment: process.env.NODE_ENV === 'development',
});
```

## Available Clients

### Catalog API Client
Handles product catalog, collections, categories, and vendor operations.

```typescript
import { CatalogApiClient } from '@patina/api-client';

const client = new CatalogApiClient(config);

// Products
await client.getProducts({ status: 'published', limit: 20 });
await client.getProduct(id);
await client.createProduct(data);
await client.updateProduct(id, data);
await client.deleteProduct(id);
await client.publishProduct(id);

// Collections
await client.getCollections();
await client.getCollection(id);
await client.createCollection(data);
await client.addProductToCollection(collectionId, { productId });

// Categories
await client.getCategories();
await client.getCategoryTree();
await client.createCategory(data);
```

### Search API Client
Handles product search, autocomplete, and similarity search with request cancellation.

```typescript
import { SearchApiClient } from '@patina/api-client';

const client = new SearchApiClient(config);

await client.search({ q: 'modern sofa', limit: 20 });
await client.autocomplete('mod', 10);
await client.similarProducts(productId, 20);

// Cancel ongoing requests
client.cancelSearch();
client.cancelAutocomplete();
```

### User Management API Client
Handles user, designer, and client management operations.

```typescript
import { UserManagementApiClient } from '@patina/api-client';

const client = new UserManagementApiClient(config);

// Users
await client.getUsers({ role: 'designer' });
await client.getUser(id);
await client.createUser(data);

// Designers
await client.getDesigners();
await client.getDesigner(id);

// Clients
await client.getClients({ designerId });
await client.createClient(data);
```

### Projects API Client
Handles project management, tasks, RFIs, change orders, and milestones.

```typescript
import { ProjectsApiClient } from '@patina/api-client';

const client = new ProjectsApiClient(config);

await client.getProjects({ designerId });
await client.getProject(id);
await client.createProject(data);
await client.getTasks(projectId);
await client.createTask(projectId, data);
await client.getMilestones(projectId);
```

### Orders API Client
Handles orders, carts, checkout, payments, and fulfillment.

```typescript
import { OrdersApiClient } from '@patina/api-client';

const client = new OrdersApiClient(config);

// Orders
await client.getOrders({ userId });
await client.getOrder(id);

// Carts
await client.createCart({ userId });
await client.getActiveCart(userId);
await client.addCartItem(cartId, item);

// Checkout
await client.checkout(cartId, { shippingAddress, paymentMethodId });
```

### Other Clients

- `CommsApiClient` - Threads, messages, and comments
- `StyleProfileApiClient` - User style preferences and quizzes
- `ProposalsApiClient` - Design proposals and sharing
- `MediaApiClient` - Media assets and photo uploads
- `NotificationsApiClient` - Notifications and preferences

## Configuration

```typescript
interface ApiClientConfig {
  baseURL: string;
  timeout?: number; // Default: 30000ms
  getSession?: () => Promise<{ accessToken?: string } | null>;
  isDevelopment?: boolean; // Enables debug logging
}
```

## Error Handling

All clients throw standardized `ApiError` objects:

```typescript
try {
  await catalogApi.getProduct('invalid-id');
} catch (error: ApiError) {
  console.error(error.code); // 'NOT_FOUND'
  console.error(error.message); // 'Product not found'
  console.error(error.requestId); // For debugging
}
```

### Error Codes

- `RATE_LIMIT_EXCEEDED` - 429 Too Many Requests
- `SERVER_ERROR` - 5xx Server Errors
- `NETWORK_ERROR` - Network/timeout errors
- Custom codes from backend services

## Response Unwrapping

The client automatically unwraps API responses that follow the `{ data: T, meta?: {} }` pattern:

```typescript
// Backend returns: { data: { id: '123', name: 'Product' }, meta: { total: 1 } }
// Client returns: { id: '123', name: 'Product' }

const product = await catalogApi.getProduct('123');
console.log(product.id); // '123'
```

## Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

## Migration from Portal-Specific Clients

### Before (Designer Portal)

```typescript
// apps/designer-portal/src/lib/api-client.ts
export class CatalogApiClient extends BaseApiClient {
  // 200+ lines of duplicate code
}

export const catalogApi = new CatalogApiClient();
```

### After (Shared Package)

```typescript
// apps/designer-portal/src/lib/api-client.ts
import { CatalogApiClient } from '@patina/api-client';
import { getSession } from 'next-auth/react';

export const catalogApi = new CatalogApiClient({
  baseURL: env.catalogApiUrl,
  getSession,
  isDevelopment: env.isDevelopment,
});
```

## License

Private - Patina Platform
