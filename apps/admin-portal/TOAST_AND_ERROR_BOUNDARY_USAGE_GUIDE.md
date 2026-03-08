# Toast Notifications & Error Boundaries - Usage Guide

## Quick Reference for Developers

### Using Toast Notifications

#### Basic Usage

```typescript
import {
  handleServiceError,
  showSuccessToast,
  showWarningToast,
  showInfoToast,
  showLoadingToast,
  updateLoadingToast,
  showBulkOperationToast,
} from '@/services/catalog/error-handlers';
```

#### Examples

**1. Success Toast**
```typescript
showSuccessToast('Product created successfully');
showSuccessToast('Product created', 'Product ID: 12345 has been added to the catalog');
```

**2. Error Toast**
```typescript
try {
  await api.deleteProduct(id);
} catch (error) {
  handleServiceError(error, 'Failed to delete product');
}
```

**3. Warning Toast**
```typescript
showWarningToast('Product has validation issues', 'Please review before publishing');
```

**4. Info Toast**
```typescript
showInfoToast('Tip: Use bulk actions for faster processing');
```

**5. Loading Toast with Update**
```typescript
const toastId = showLoadingToast('Publishing products...');

try {
  const result = await api.bulkPublish(productIds);
  updateLoadingToast(toastId, true, 'Products published', `${result.count} items published`);
} catch (error) {
  updateLoadingToast(toastId, false, 'Failed to publish', error.message);
}
```

**6. Bulk Operation Toast**
```typescript
// Shows appropriate toast based on results
showBulkOperationToast('Bulk publish', 8, 2, 10);
// Result: Warning toast showing "Successful: 8, Failed: 2, Total: 10"
```

### Using Error Boundaries

#### Dashboard-Level Protection

Already implemented in `src/app/(dashboard)/layout.tsx`. Catches all errors in the dashboard.

#### Catalog-Level Protection

Already implemented in `src/app/(dashboard)/catalog/layout.tsx`. Uses custom catalog fallback.

#### Adding to Custom Components

**Basic Error Boundary:**
```typescript
import { ErrorBoundary } from '@/components/error-boundary';

export function MyComponent() {
  return (
    <ErrorBoundary>
      <YourComponentThatMightError />
    </ErrorBoundary>
  );
}
```

**With Error Callback:**
```typescript
<ErrorBoundary
  onError={(error, errorInfo) => {
    console.error('[MyComponent Error]', error, errorInfo);
    // Send to Sentry, analytics, etc.
  }}
>
  <YourComponent />
</ErrorBoundary>
```

**With Custom Fallback:**
```typescript
<ErrorBoundary
  fallback={
    <div>
      <h2>Custom Error UI</h2>
      <p>Something went wrong in this section.</p>
    </div>
  }
>
  <YourComponent />
</ErrorBoundary>
```

**Creating Custom Fallback Components:**
```typescript
import { CatalogErrorFallback } from '@/components/catalog/catalog-error-fallback';

function MyCustomFallback({ error, reset }: { error?: Error; reset?: () => void }) {
  return (
    <div>
      <h3>My Feature Failed</h3>
      <p>{error?.message}</p>
      <button onClick={reset}>Try Again</button>
    </div>
  );
}

// Usage
<ErrorBoundary fallback={<MyCustomFallback />}>
  <MyFeature />
</ErrorBoundary>
```

## Toast Configuration

### Default Settings

```typescript
<Toaster
  position="top-right"    // Where toasts appear
  expand={false}          // Don't expand on hover
  richColors             // Use theme colors
  closeButton            // Show close button
  duration={4000}        // 4 seconds default
/>
```

### Duration Guidelines

- **Success:** 3 seconds - Quick confirmation
- **Info:** 3 seconds - Non-critical information
- **Warning:** 4 seconds - Important but not critical
- **Error:** 5 seconds - Critical, needs attention
- **Loading:** No duration - Dismissed programmatically

## Error Boundary Features

### Automatic Features

1. **Error Catching:** Catches JavaScript errors in child components
2. **Fallback UI:** Shows user-friendly error message
3. **Error Details:** Collapsible section with stack trace
4. **Console Logging:** Logs errors with context
5. **Recovery Actions:**
   - Try Again (resets error boundary)
   - Reload Page (full refresh)
   - Go to Dashboard (safe navigation)

### Integration with Sentry (TODO)

```typescript
// Uncomment in production
<ErrorBoundary
  onError={(error, errorInfo) => {
    Sentry.captureException(error, {
      extra: errorInfo,
      tags: {
        component: 'CatalogPage',
        user_id: currentUser.id,
      },
    });
  }}
>
  <CatalogPage />
</ErrorBoundary>
```

## Best Practices

### Toast Notifications

1. **Use Appropriate Types:**
   - Success: Completed operations
   - Error: Failed operations, critical issues
   - Warning: Partial failures, important notices
   - Info: Tips, non-critical information

2. **Provide Context:**
   ```typescript
   // Good
   showSuccessToast('Product published', 'Product #12345 is now live');

   // Bad
   showSuccessToast('Success');
   ```

3. **Use Loading Toasts for Async Operations:**
   ```typescript
   const toastId = showLoadingToast('Processing...');
   // ... do work ...
   updateLoadingToast(toastId, true, 'Done!');
   ```

4. **Bulk Operations:**
   Always use `showBulkOperationToast` for batch operations to provide clear feedback.

### Error Boundaries

1. **Place at Logical Boundaries:**
   - Layout level (dashboard, catalog)
   - Feature level (product editor, order manager)
   - Component level (complex components)

2. **Don't Overuse:**
   - Too many boundaries can make debugging harder
   - Use at boundaries where recovery makes sense

3. **Provide Context in Fallbacks:**
   - Tell users what failed
   - Explain possible causes
   - Offer actionable recovery steps

4. **Log Errors Properly:**
   ```typescript
   onError={(error, errorInfo) => {
     console.error('[Context]', error, errorInfo);
     // TODO: Send to error tracking
   }}
   ```

## Common Patterns

### Form Submission
```typescript
async function handleSubmit(data: FormData) {
  const toastId = showLoadingToast('Saving product...');

  try {
    const result = await saveProduct(data);
    updateLoadingToast(toastId, true, 'Product saved', `ID: ${result.id}`);
    router.push(`/catalog/${result.id}`);
  } catch (error) {
    updateLoadingToast(toastId, false, 'Failed to save product');
    handleServiceError(error, 'An error occurred while saving');
  }
}
```

### API Error Handling
```typescript
try {
  const data = await api.fetchProducts();
  return data;
} catch (error) {
  handleServiceError(error, 'Failed to load products');
  throw error; // Re-throw if component needs to handle it
}
```

### Protected Component with Fallback
```typescript
function CatalogPage() {
  return (
    <ErrorBoundary
      fallback={<CatalogErrorFallback />}
      onError={(error, errorInfo) => {
        console.error('[Catalog]', error);
        // TODO: Sentry.captureException(error, { extra: errorInfo });
      }}
    >
      <ProductList />
      <CategoryTree />
      <FilterPanel />
    </ErrorBoundary>
  );
}
```

## Troubleshooting

### Toasts Not Appearing

1. Check that `<Toaster />` is in root layout
2. Verify Sonner is imported correctly
3. Check browser console for errors

### Error Boundary Not Catching Errors

1. Error boundaries only catch errors in **child components**
2. They don't catch:
   - Event handlers (use try/catch)
   - Async code (use try/catch)
   - Server-side rendering errors
   - Errors in the error boundary itself

### Example: Event Handler Error
```typescript
// ERROR BOUNDARY WON'T CATCH THIS:
function BadComponent() {
  const handleClick = () => {
    throw new Error('This error is NOT caught by error boundary');
  };
  return <button onClick={handleClick}>Click</button>;
}

// CORRECT WAY:
function GoodComponent() {
  const handleClick = () => {
    try {
      // ... code that might throw ...
    } catch (error) {
      handleServiceError(error, 'Failed to process click');
    }
  };
  return <button onClick={handleClick}>Click</button>;
}
```

## Testing

### Testing Components with Error Boundaries

```typescript
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/error-boundary';

function ThrowError() {
  throw new Error('Test error');
}

test('should show error fallback', () => {
  render(
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
});
```

### Testing Toast Notifications

```typescript
import { toast } from 'sonner';
import { handleServiceError } from '@/services/catalog/error-handlers';

jest.mock('sonner');

test('should show error toast', () => {
  const error = new Error('API Error');
  handleServiceError(error, 'Failed');

  expect(toast.error).toHaveBeenCalledWith(
    'API Error',
    expect.objectContaining({
      duration: 5000,
    })
  );
});
```

## Reference Links

- [Sonner Documentation](https://sonner.emilkowal.ski/)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Next.js Error Handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)

---

**Last Updated:** 2025-10-19
**Maintained By:** Frontend Team
