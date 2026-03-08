# Designer Portal API Integration Guide

## Overview

This document provides comprehensive guidance on how to use the API integrations in the Designer Portal. All backend services have been integrated with real API calls, optimistic updates, error handling, and real-time functionality.

## Table of Contents

1. [Architecture](#architecture)
2. [API Clients](#api-clients)
3. [React Query Hooks](#react-query-hooks)
4. [WebSocket Integration](#websocket-integration)
5. [Error Handling](#error-handling)
6. [Optimistic Updates](#optimistic-updates)
7. [Best Practices](#best-practices)

---

## Architecture

### Service Endpoints

The Designer Portal integrates with the following backend services:

| Service | Port | Base URL | Purpose |
|---------|------|----------|---------|
| User Management | 3000 | http://localhost:3000 | User, designer, and client management |
| Style Profile | 3001 | http://localhost:3001 | Style profiles, quizzes, signals |
| Search | 3002 | http://localhost:3002 | Product search, autocomplete, facets |
| Catalog | 3003 | http://localhost:3003 | Products, collections, categories |
| Orders | 3005 | http://localhost:3005 | Carts, orders, checkout, payments |
| Comms | 3006 | http://localhost:3006 | Messaging, threads, real-time chat |
| Projects | 3007 | http://localhost:3007 | Projects, proposals, tasks, RFIs |

### Configuration

Service URLs are configured in `/src/lib/env.ts` and can be overridden via environment variables:

```bash
NEXT_PUBLIC_CATALOG_API_URL=http://localhost:3003
NEXT_PUBLIC_SEARCH_API_URL=http://localhost:3002
NEXT_PUBLIC_STYLE_PROFILE_API_URL=http://localhost:3001
NEXT_PUBLIC_ORDERS_API_URL=http://localhost:3005
NEXT_PUBLIC_COMMS_API_URL=http://localhost:3006
NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3007
NEXT_PUBLIC_USER_MANAGEMENT_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3006/ws
```

---

## API Clients

### Base API Client

All API clients extend `BaseApiClient` which provides:

- **Authentication**: Automatic token injection from sessionStorage
- **Request IDs**: Unique request tracking for debugging
- **Error Handling**: Automatic API error conversion
- **Type Safety**: TypeScript support throughout

Location: `/src/lib/api-client.ts`

### Available Clients

#### 1. Catalog API Client

```typescript
import { catalogApi } from '@/lib/api-client';

// Products
await catalogApi.getProducts({ status: 'published' });
await catalogApi.getProduct(productId);
await catalogApi.getProductBySlug(slug);
await catalogApi.searchProducts(query, { limit: 20 });

// Collections
await catalogApi.getCollections();
await catalogApi.getCollection(collectionId);
await catalogApi.getCollectionProducts(collectionId);

// Categories
await catalogApi.getCategories();
await catalogApi.getCategoryTree();

// Variants
await catalogApi.getVariants(productId);

// Vendors
await catalogApi.getVendors();
```

#### 2. Search API Client

```typescript
import { searchApi } from '@/lib/api-client';

// Search with automatic request cancellation
await searchApi.search({
  q: 'modern sofa',
  filters: 'category:furniture',
  limit: 20,
  sort: 'relevance'
});

// Autocomplete with debouncing
await searchApi.autocomplete('mod', 10);

// Similar products
await searchApi.similarProducts(productId);

// Manual cancellation
searchApi.cancelSearch();
```

#### 3. Orders API Client

```typescript
import { ordersApi } from '@/lib/api-client';

// Carts
await ordersApi.createCart({ userId });
await ordersApi.getActiveCart(userId);
await ordersApi.addCartItem(cartId, { productId, quantity });
await ordersApi.updateCartItem(cartId, itemId, { quantity });
await ordersApi.removeCartItem(cartId, itemId);
await ordersApi.applyDiscount(cartId, code);

// Orders
await ordersApi.getOrders({ userId, status: 'pending' });
await ordersApi.getOrder(orderId);
await ordersApi.cancelOrder(orderId, reason);

// Checkout
await ordersApi.checkout(cartId, {
  shippingAddress: { /* ... */ },
  paymentMethodId: 'pm_123'
});
```

#### 4. User Management API Client

```typescript
import { userManagementApi } from '@/lib/api-client';

// Clients
await userManagementApi.getClients({ designerId, search: 'John' });
await userManagementApi.getClient(clientId);
await userManagementApi.createClient({
  email: 'client@example.com',
  firstName: 'John',
  lastName: 'Doe'
});
await userManagementApi.updateClient(clientId, { phone: '555-1234' });
await userManagementApi.getClientProjects(clientId);
await userManagementApi.getClientOrders(clientId);
```

#### 5. Proposals API Client

```typescript
import { proposalsApi } from '@/lib/api-client';

// Proposals
await proposalsApi.getProposals({ designerId, status: 'draft' });
await proposalsApi.getProposal(proposalId);
await proposalsApi.createProposal({
  title: 'Living Room Design',
  clientId,
  designerId
});

// Sections
await proposalsApi.createSection(proposalId, { name: 'Seating' });

// Items
await proposalsApi.addItem(proposalId, sectionId, {
  productId,
  quantity: 2,
  notes: 'Client favorite'
});

// Actions
await proposalsApi.sendProposal(proposalId);
await proposalsApi.exportProposal(proposalId, 'pdf');
```

#### 6. Communications API Client

```typescript
import { commsApi } from '@/lib/api-client';

// Threads
await commsApi.getThreads({ scope: 'designer' });
await commsApi.getThread(threadId);

// Messages
await commsApi.createMessage(threadId, {
  bodyText: 'Hello!',
  attachments: []
});

await commsApi.markRead(threadId, lastMessageId);
```

---

## React Query Hooks

### Product Hooks

Location: `/src/hooks/use-products.ts`

```typescript
import {
  useProducts,
  useProduct,
  useCollections,
  useCategories,
  useCategoryTree
} from '@/hooks/use-products';

function ProductList() {
  const { data, isLoading, error } = useProducts({
    status: 'published',
    categoryId: 'cat-123'
  });

  return (
    <>
      {isLoading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
      {data?.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </>
  );
}
```

### Client Hooks

Location: `/src/hooks/use-clients.ts`

```typescript
import {
  useClients,
  useClient,
  useCreateClient,
  useUpdateClient
} from '@/hooks/use-clients';

function ClientManager() {
  const { data: clients } = useClients({ designerId: 'designer-123' });
  const createClient = useCreateClient();

  const handleCreate = async () => {
    await createClient.mutateAsync({
      email: 'client@example.com',
      firstName: 'Jane',
      lastName: 'Smith'
    });
  };

  return (/* ... */);
}
```

### Proposal Hooks

Location: `/src/hooks/use-proposals.ts`

```typescript
import {
  useProposals,
  useProposal,
  useCreateProposal,
  useAddProposalItem,
  useSendProposal
} from '@/hooks/use-proposals';

function ProposalEditor({ proposalId }: { proposalId: string }) {
  const { data: proposal } = useProposal(proposalId);
  const addItem = useAddProposalItem();
  const send = useSendProposal();

  const handleAddProduct = async (productId: string) => {
    await addItem.mutateAsync({
      proposalId,
      sectionId: 'section-1',
      item: { productId, quantity: 1 }
    });
  };

  const handleSend = async () => {
    await send.mutateAsync({
      id: proposalId,
      data: { message: 'Your proposal is ready!' }
    });
  };

  return (/* ... */);
}
```

### Order & Cart Hooks

Location: `/src/hooks/use-orders.ts`

```typescript
import {
  useActiveCart,
  useAddCartItem,
  useUpdateCartItem,
  useRemoveCartItem,
  useCheckout
} from '@/hooks/use-orders';

function ShoppingCart({ userId }: { userId: string }) {
  const { data: cart } = useActiveCart(userId);
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const checkout = useCheckout();

  // All mutations include optimistic updates!
  const handleAddToCart = async (productId: string) => {
    await addItem.mutateAsync({
      cartId: cart.id,
      item: { productId, quantity: 1 }
    });
  };

  return (/* ... */);
}
```

### Search Hooks

Location: `/src/hooks/use-search.ts`

```typescript
import { useSearch, useAutocomplete } from '@/hooks/use-search';

function SearchBar() {
  const [query, setQuery] = useState('');
  const { data: results } = useSearch({ q: query }, query.length >= 2);
  const { data: suggestions } = useAutocomplete(query, query.length >= 2);

  // Automatic request cancellation on query change
  return (/* ... */);
}
```

---

## WebSocket Integration

### WebSocket Client

Location: `/src/lib/websocket.ts`

The WebSocket client provides:

- **Automatic reconnection** with exponential backoff
- **Heartbeat/ping** to keep connection alive
- **Event-based messaging** system
- **Connection state management**

### WebSocket Hooks

Location: `/src/hooks/use-websocket.ts`

#### Real-time Messages

```typescript
import { useRealtimeMessages, useTypingIndicator } from '@/hooks/use-websocket';

function ChatThread({ threadId }: { threadId: string }) {
  // Automatically updates when new messages arrive
  useRealtimeMessages(threadId);

  const { typingUsers, setTyping } = useTypingIndicator(threadId);

  const handleTyping = () => {
    setTyping(true, userId);
  };

  return (
    <>
      {typingUsers.length > 0 && (
        <div>{typingUsers.join(', ')} is typing...</div>
      )}
    </>
  );
}
```

#### Real-time Notifications

```typescript
import { useRealtimeNotifications } from '@/hooks/use-websocket';

function NotificationBell() {
  const { notifications, clearNotifications } = useRealtimeNotifications();

  return (
    <div>
      <Badge count={notifications.length} />
    </div>
  );
}
```

#### Connection State

```typescript
import { useWebSocketConnectionState } from '@/hooks/use-websocket';

function ConnectionIndicator() {
  const isConnected = useWebSocketConnectionState();

  return (
    <div className={isConnected ? 'text-green-500' : 'text-red-500'}>
      {isConnected ? 'Connected' : 'Disconnected'}
    </div>
  );
}
```

---

## Error Handling

### Global Error Handling

Location: `/src/lib/error-handler.ts`

All API errors are automatically:

1. **Converted to AppError** with user-friendly messages
2. **Logged** for monitoring (production: send to Sentry/DataDog)
3. **Displayed** via toast notifications
4. **Handled** based on error type:
   - **Auth errors (401)**: Automatic redirect to login
   - **Network errors**: Automatic retry with exponential backoff
   - **Other errors**: User notification

### Error Boundary

Location: `/src/components/error-boundary.tsx`

```typescript
import { ErrorBoundary } from '@/components/error-boundary';

function App() {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div>
          <h1>Error: {error.message}</h1>
          <button onClick={reset}>Try Again</button>
        </div>
      )}
    >
      <YourApp />
    </ErrorBoundary>
  );
}
```

### Manual Error Handling

```typescript
import { showErrorToast, showSuccessToast } from '@/lib/error-handler';

async function saveData() {
  try {
    await api.save(data);
    showSuccessToast('Data saved successfully');
  } catch (error) {
    showErrorToast(error, 'Save Failed');
  }
}
```

---

## Optimistic Updates

### Cart Operations

Cart mutations (`addItem`, `updateItem`, `removeItem`) include optimistic updates:

```typescript
const addItem = useAddCartItem();

// UI updates immediately, then rolls back on error
await addItem.mutateAsync({
  cartId: '123',
  item: { productId: 'prod-456', quantity: 1 }
});
```

### Message Sending

```typescript
const sendMessage = useSendMessage();

// Message appears immediately with "sending" status
await sendMessage.mutateAsync({
  threadId: 'thread-123',
  data: { bodyText: 'Hello!' }
});
```

### Implementation Example

```typescript
export function useAddCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cartId, item }) => ordersApi.addCartItem(cartId, item),
    // Optimistic update
    onMutate: async ({ cartId, item }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['carts', cartId] });

      // Snapshot previous value
      const previousCart = queryClient.getQueryData(['carts', cartId]);

      // Optimistically update
      queryClient.setQueryData(['carts', cartId], (old: any) => ({
        ...old,
        items: [...old.items, { ...item, id: `temp-${Date.now()}` }]
      }));

      return { previousCart };
    },
    // Rollback on error
    onError: (_err, { cartId }, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['carts', cartId], context.previousCart);
      }
    },
    // Refetch on success
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['carts', cartId] });
    }
  });
}
```

---

## Best Practices

### 1. Query Keys

Always use the centralized query keys from `/src/lib/react-query.ts`:

```typescript
import { queryKeys } from '@/lib/react-query';

// Good
queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

// Bad
queryClient.invalidateQueries({ queryKey: ['products'] });
```

### 2. Conditional Queries

Use the `enabled` option to control when queries run:

```typescript
// Only fetch when productId is available
const { data } = useProduct(productId, {
  enabled: !!productId
});
```

### 3. Loading States

Always handle loading, error, and empty states:

```typescript
function ProductList() {
  const { data, isLoading, error } = useProducts();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data || data.length === 0) return <EmptyState />;

  return <div>{/* Render products */}</div>;
}
```

### 4. Mutation Feedback

Provide visual feedback for mutations:

```typescript
const updateClient = useUpdateClient();

const handleUpdate = async () => {
  try {
    await updateClient.mutateAsync({ id, data });
    showSuccessToast('Client updated successfully');
  } catch (error) {
    // Error automatically shown by global handler
  }
};

return (
  <button
    onClick={handleUpdate}
    disabled={updateClient.isPending}
  >
    {updateClient.isPending ? 'Saving...' : 'Save'}
  </button>
);
```

### 5. WebSocket Lifecycle

Connect WebSocket at app root and let it persist:

```typescript
// In app root or layout
import { useWebSocketConnection } from '@/hooks/use-websocket';

function RootLayout() {
  const { isConnected } = useWebSocketConnection();

  return (
    <>
      <ConnectionIndicator connected={isConnected} />
      {children}
    </>
  );
}
```

### 6. Type Safety

Always use TypeScript interfaces for API data:

```typescript
interface Product {
  id: string;
  name: string;
  price: number;
  // ...
}

const { data } = useProduct<Product>(productId);
```

### 7. Cache Invalidation

Invalidate related queries after mutations:

```typescript
const createProposal = useCreateProposal();

const handleCreate = async (data: CreateProposalData) => {
  const result = await createProposal.mutateAsync(data);

  // Invalidate all proposal lists
  queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });

  // Navigate to new proposal
  router.push(`/proposals/${result.id}`);
};
```

### 8. Error Recovery

Provide retry mechanisms for failed requests:

```typescript
const { data, error, refetch } = useProducts();

if (error) {
  return (
    <div>
      <p>Failed to load products</p>
      <button onClick={() => refetch()}>Retry</button>
    </div>
  );
}
```

---

## Testing

### Integration Tests

Location: `/src/hooks/__tests__/`

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useProducts } from '../use-products';

test('fetches products', async () => {
  const { result } = renderHook(() => useProducts(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={testQueryClient}>
        {children}
      </QueryClientProvider>
    )
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(10);
});
```

---

## Troubleshooting

### Common Issues

1. **401 Errors**: Check if token is set in sessionStorage
2. **CORS Errors**: Verify API service CORS configuration
3. **WebSocket not connecting**: Check WS_URL and network firewall
4. **Stale data**: Review cache invalidation logic
5. **Slow queries**: Check `staleTime` and `gcTime` settings

### Debug Mode

Enable React Query DevTools in development:

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

---

## Summary

The Designer Portal now has complete API integration with:

- ✅ **7 backend services** fully integrated
- ✅ **Type-safe API clients** with error handling
- ✅ **React Query hooks** for all operations
- ✅ **Real-time WebSocket** integration
- ✅ **Optimistic updates** for better UX
- ✅ **Global error handling** with retry logic
- ✅ **Request cancellation** for search
- ✅ **Automatic reconnection** for WebSocket
- ✅ **Comprehensive documentation**

All mock data has been replaced with real API calls, providing a production-ready integration layer.
