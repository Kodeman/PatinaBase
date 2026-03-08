# Error Handling Guide - Client Portal

## Quick Reference

### When to Use Each Error Boundary

| Scenario | Component | Location |
|----------|-----------|----------|
| Entire app crashes | `global-error.tsx` | Root level |
| Page-level errors | `error.tsx` | Each route segment |
| Specific route errors | `[route]/error.tsx` | Nested routes |
| Component errors | `ErrorBoundary` wrapper | Individual components |

### Error Boundary Hierarchy

```
app/
├── global-error.tsx        # Catches everything
├── error.tsx               # Catches page-level errors
├── page.tsx
└── projects/
    ├── error.tsx           # Catches /projects errors
    ├── page.tsx
    └── [projectId]/
        ├── error.tsx       # Catches /projects/[id] errors
        └── page.tsx
```

## Using the API Client

### Basic Usage

```typescript
import { getProjectsClient } from '@/lib/api-client';

// Automatic retry (2 attempts by default)
const projects = await getProjectsClient().getProjects();

// With AbortSignal for cancellation
const controller = new AbortController();
const projects = await getProjectsClient().getProjects(controller.signal);

// Cancel request
controller.abort();
```

### Error Handling

```typescript
import { isApiError, ApiError } from '@/lib/api-client';

try {
  const data = await getProjectsClient().getProjects();
} catch (error) {
  if (isApiError(error)) {
    // Type-safe error handling
    console.error('API Error:', error.status, error.message);
  } else {
    // Network or other errors
    console.error('Unexpected error:', error);
  }
}
```

### Custom Retry Configuration

The API client uses different retry strategies:

- **GET requests**: 2 retries (data fetching)
- **POST/PUT requests**: 1 retry (mutations)
- **Analytics**: 0 retries (fire and forget)

Exponential backoff: 1s → 2s → 4s

## Using Fallback Components

### Error Fallback

```typescript
import { ErrorFallback } from '@/components/error-fallback';

function MyComponent() {
  const [error, setError] = useState<Error | null>(null);

  if (error) {
    return (
      <ErrorFallback
        error={error}
        title="Failed to load data"
        onRetry={() => {
          setError(null);
          refetch();
        }}
        onBack={() => router.back()}
        showDetails={true}
      />
    );
  }

  // Normal render
}
```

### Loading Fallback

```typescript
import { LoadingFallback } from '@/components/error-fallback';

function MyComponent() {
  const { data, isLoading } = useQuery();

  if (isLoading) {
    return <LoadingFallback message="Loading projects..." />;
  }

  // Normal render
}
```

### Empty State Fallback

```typescript
import { EmptyStateFallback } from '@/components/error-fallback';

function MyComponent() {
  const { data } = useQuery();

  if (!data || data.length === 0) {
    return (
      <EmptyStateFallback
        title="No projects yet"
        message="Create your first project to get started"
        actionLabel="Create project"
        onAction={() => router.push('/projects/new')}
      />
    );
  }

  // Normal render
}
```

## Best Practices

### 1. Always Handle Loading States

```typescript
// ✅ Good
export default async function Page() {
  const data = await fetchData();
  return <Content data={data} />;
}

// Loading.tsx in same directory
export default function Loading() {
  return <LoadingFallback message="Loading..." />;
}
```

```typescript
// ❌ Bad - No loading state
export default async function Page() {
  const data = await fetchData(); // User sees nothing while this loads
  return <Content data={data} />;
}
```

### 2. Use Specific Error Messages

```typescript
// ✅ Good
throw new Error('Failed to load project: Invalid project ID');

// ❌ Bad
throw new Error('Error');
```

### 3. Provide Recovery Options

```typescript
// ✅ Good
<ErrorFallback
  error={error}
  onRetry={() => refetch()}
  onBack={() => router.back()}
/>

// ❌ Bad - No way to recover
<div>Error: {error.message}</div>
```

### 4. Log Errors Properly

```typescript
// ✅ Good
useEffect(() => {
  if (error) {
    console.error('Component error:', {
      error: error.message,
      stack: error.stack,
      context: { userId, projectId },
    });
  }
}, [error]);

// ❌ Bad
console.log('error', error);
```

### 5. Handle Different Error Types

```typescript
// ✅ Good
try {
  await api.call();
} catch (error) {
  if (error.status === 404) {
    // Handle not found
  } else if (error.status === 403) {
    // Handle forbidden
  } else if (error.status >= 500) {
    // Handle server errors (will retry automatically)
  } else {
    // Handle other errors
  }
}

// ❌ Bad - Treat all errors the same
try {
  await api.call();
} catch (error) {
  showError('Something went wrong');
}
```

## Common Scenarios

### Scenario 1: Server-Side Data Fetching

```typescript
// app/projects/page.tsx
export default async function ProjectsPage() {
  const projects = await getProjectsClient().getProjects();

  return <ProjectsList projects={projects} />;
}

// app/projects/loading.tsx
export default function Loading() {
  return <ProjectsLoadingSkeleton />;
}

// app/projects/error.tsx
export default function Error({ error, reset }) {
  return (
    <ErrorFallback
      error={error}
      title="Failed to load projects"
      onRetry={reset}
    />
  );
}
```

### Scenario 2: Client-Side Data Fetching

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorFallback, LoadingFallback } from '@/components/error-fallback';

export function ProjectsList() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjectsClient().getProjects(),
  });

  if (isLoading) {
    return <LoadingFallback message="Loading projects..." />;
  }

  if (error) {
    return (
      <ErrorFallback
        error={error}
        title="Failed to load projects"
        onRetry={() => refetch()}
      />
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyStateFallback
        title="No projects"
        message="You don't have any projects yet"
      />
    );
  }

  return <div>{/* Render projects */}</div>;
}
```

### Scenario 3: Form Submission with Error Handling

```typescript
'use client';

import { useState } from 'react';

export function ProjectForm() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(data: FormData) {
    setIsSubmitting(true);
    setError(null);

    try {
      await getProjectsClient().createProject(data);
      router.push('/projects');
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError('Failed to create project. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Form fields */}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  );
}
```

### Scenario 4: Handling Auth Errors

```typescript
import { redirect } from 'next/navigation';

export default async function ProtectedPage() {
  try {
    const data = await getProjectsClient().getProjects();
    return <Content data={data} />;
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirect('/auth/signin?callbackUrl=/projects');
    }
    throw error; // Let error boundary handle other errors
  }
}
```

## Debugging

### Enable Detailed Logging

Set environment variable:
```bash
NODE_ENV=development
```

This enables:
- Error stack traces in error boundaries
- Detailed retry logs in console
- Network error debugging info

### Common Issues

**Issue**: Error boundary not catching errors
- ✅ Solution: Error boundaries only catch errors in React components, not in event handlers or async code
- Use try/catch for event handlers and async operations

**Issue**: Infinite retry loop
- ✅ Solution: Check retry configuration, ensure server returns correct status codes
- Use different retry strategies for different endpoints

**Issue**: Loading state flickers
- ✅ Solution: Use Suspense boundaries and streaming for better UX
- Consider minimum loading time to avoid flicker

## Resources

- [Next.js Error Handling Docs](https://nextjs.org/docs/app/building-your-application/routing/error-handling)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [TanStack Query Error Handling](https://tanstack.com/query/latest/docs/react/guides/query-retries)
