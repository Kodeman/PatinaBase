# Designer Portal API Integration Guide

This guide provides practical examples and best practices for integrating backend services in the Designer Portal using React Query.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Using React Query Hooks](#using-react-query-hooks)
3. [Real-Time Integration](#real-time-integration)
4. [Error Handling](#error-handling)
5. [Optimistic Updates](#optimistic-updates)
6. [Search & Autocomplete](#search--autocomplete)
7. [Best Practices](#best-practices)

---

## Quick Start

### 1. Import the Hook

```typescript
import { useProducts } from '@/hooks/use-products';
```

### 2. Use in Component

```typescript
function ProductList() {
  const { data, isLoading, error } = useProducts({ status: 'active' });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorState error={error} />;

  return (
    <div>
      {data?.products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

---

## Using React Query Hooks

### Fetching Data

```typescript
import { useProduct } from '@/hooks/use-products';

function ProductDetail({ productId }: { productId: string }) {
  const { data: product, isLoading, error } = useProduct(productId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{product.name}</div>;
}
```

### Mutating Data

```typescript
import { useCreateProposal } from '@/hooks/use-proposals';

function CreateButton() {
  const create = useCreateProposal();

  const handleCreate = async () => {
    await create.mutateAsync({
      title: 'New Proposal',
      clientId: 'client_123',
      designerId: 'designer_456'
    });
  };

  return (
    <button onClick={handleCreate} disabled={create.isPending}>
      {create.isPending ? 'Creating...' : 'Create'}
    </button>
  );
}
```

---

## Real-Time Integration

### WebSocket Messages

```typescript
import { useThread, useSendMessage } from '@/hooks/use-comms';

function ChatThread({ threadId }: { threadId: string }) {
  const { data: thread } = useThread(threadId); // Auto real-time updates
  const sendMessage = useSendMessage();

  const handleSend = async (text: string) => {
    await sendMessage.mutateAsync({
      threadId,
      data: { bodyText: text }
    });
  };

  return (
    <div>
      <MessageList messages={thread?.messages} />
      <MessageInput onSend={handleSend} />
    </div>
  );
}
```

---

## Error Handling

```typescript
import { getErrorMessage } from '@/lib/error-handler';

function Component() {
  const { data, error, refetch } = useProducts();

  if (error) {
    return (
      <div>
        <p>{getErrorMessage(error)}</p>
        <button onClick={() => refetch()}>Try Again</button>
      </div>
    );
  }

  return <div>...</div>;
}
```

---

## Optimistic Updates

```typescript
import { useAddCartItem } from '@/hooks/use-orders';

function AddToCartButton({ productId, cartId }: any) {
  const addItem = useAddCartItem();

  const handleAdd = () => {
    // UI updates immediately, rolls back on error
    addItem.mutate({
      cartId,
      item: { productId, quantity: 1 }
    });
  };

  return <button onClick={handleAdd}>Add to Cart</button>;
}
```

---

## Search & Autocomplete

```typescript
import { useState } from 'react';
import { useSearch } from '@/hooks/use-search';
import { useDebounce } from '@/lib/debounce';

function ProductSearch() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data, isLoading } = useSearch(
    { q: debouncedQuery },
    debouncedQuery.length >= 2
  );

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      {isLoading && <div>Searching...</div>}
      <SearchResults results={data?.results} />
    </div>
  );
}
```

---

## Best Practices

### 1. Use Query Keys Consistently

```typescript
// ✅ GOOD
import { queryKeys } from '@/lib/react-query';
const { data } = useQuery({
  queryKey: queryKeys.products.detail(productId),
  queryFn: () => catalogApi.getProduct(productId),
});
```

### 2. Handle Loading States

```typescript
// ✅ GOOD
if (isLoading) return <Skeleton />;
if (error) return <ErrorState />;
if (!data) return null;
```

### 3. Debounce Search

```typescript
// ✅ GOOD
const debouncedQuery = useDebounce(query, 300);
const { data } = useSearch({ q: debouncedQuery });
```

---

For more detailed examples, see the full documentation in the codebase.
