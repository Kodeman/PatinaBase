# Designer Portal - Next Implementation Steps

This guide provides detailed implementation steps for completing the Patina Designer Portal.

## Current Status

✅ **COMPLETED:**
- Next.js 15 application structure
- TypeScript configuration (strict mode)
- API client layer with type safety
- React Query hooks for all services
- Environment configuration
- Build optimization
- Global styles and theming

🚧 **IN PROGRESS:**
- Root layout and providers

📋 **PENDING:**
- Authentication
- Navigation
- Page implementations
- UI components
- Testing

---

## Phase 1: Authentication & Navigation (Week 1)

### Step 1: Install NextAuth Dependencies

```bash
cd /home/middle/patina/apps/designer-portal
pnpm add next-auth@beta @auth/core
```

### Step 2: Create NextAuth Configuration

**File:** `src/lib/auth.ts`

```typescript
import NextAuth from 'next-auth';
import { JWT } from 'next-auth/jwt';

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [
    {
      id: 'oci-identity-domains',
      name: 'OCI Identity Domains',
      type: 'oidc',
      issuer: process.env.NEXT_PUBLIC_OIDC_ISSUER,
      clientId: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      authorization: {
        params: {
          scope: process.env.NEXT_PUBLIC_OIDC_SCOPE,
        },
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.roles = profile.roles || [];
      }
      return token;
    },
    async session({ session, token }) {
      session.user.roles = token.roles as string[];
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
});
```

### Step 3: Create Auth API Route

**File:** `src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
```

### Step 4: Create Auth Middleware

**File:** `src/middleware.ts`

```typescript
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth');
  const isPublicPage = req.nextUrl.pathname === '/';

  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    return NextResponse.redirect(new URL('/auth/signin', req.url));
  }

  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

### Step 5: Create Auth Pages

**File:** `src/app/auth/signin/page.tsx`

```typescript
import { signIn } from '@/lib/auth';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Patina Designer Portal</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to access your account
          </p>
        </div>
        <form
          action={async () => {
            'use server';
            await signIn('oci-identity-domains', { redirectTo: '/dashboard' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            Sign in with OCI Identity Domains
          </button>
        </form>
      </div>
    </div>
  );
}
```

### Step 6: Create Navigation Component

**File:** `src/components/layout/nav.tsx`

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Clients', href: '/clients' },
  { name: 'Catalog', href: '/catalog' },
  { name: 'Proposals', href: '/proposals' },
  { name: 'Projects', href: '/projects' },
  { name: 'Messages', href: '/messages' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex space-x-4">
      {navigation.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          className={cn(
            'rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === item.href
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-muted'
          )}
        >
          {item.name}
        </Link>
      ))}
    </nav>
  );
}
```

### Step 7: Create Dashboard Layout

**File:** `src/app/(dashboard)/layout.tsx`

```typescript
import { Nav } from '@/components/layout/nav';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/auth/signin');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold">Patina</h1>
            <Nav />
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm">{session.user?.name}</span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <button className="text-sm text-muted-foreground hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container mx-auto py-8">{children}</main>
    </div>
  );
}
```

---

## Phase 2: Core Pages (Week 2-3)

### Step 8: Dashboard Page

**File:** `src/app/(dashboard)/dashboard/page.tsx`

```typescript
import { auth } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session?.user?.name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Stats cards */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Active Clients
          </h3>
          <p className="mt-2 text-3xl font-bold">12</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Open Proposals
          </h3>
          <p className="mt-2 text-3xl font-bold">8</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Active Projects
          </h3>
          <p className="mt-2 text-3xl font-bold">5</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Unread Messages
          </h3>
          <p className="mt-2 text-3xl font-bold">23</p>
        </div>
      </div>

      {/* Recent activity, proposals, etc. */}
    </div>
  );
}
```

### Step 9: Catalog Page with Search

**File:** `src/app/(dashboard)/catalog/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useSearch } from '@/hooks/use-search';

export default function CatalogPage() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState('');

  const { data, isLoading } = useSearch({ q: query, filters });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Catalog</h1>
        <p className="text-muted-foreground">
          Browse and search our product catalog
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-4">
        <input
          type="search"
          placeholder="Search products..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-md border px-4 py-2"
        />
      </div>

      {/* Filters sidebar + Product grid */}
      <div className="grid gap-6 lg:grid-cols-4">
        <aside className="space-y-4">
          {/* Facet filters */}
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Category</h3>
            {/* Category checkboxes */}
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Price Range</h3>
            {/* Price range slider */}
          </div>
        </aside>

        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Loading skeletons */}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data?.data?.map((product: any) => (
                <div
                  key={product.id}
                  className="rounded-lg border bg-card p-4"
                >
                  {/* Product card */}
                  <div className="aspect-square bg-muted" />
                  <h3 className="mt-2 font-semibold">{product.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {product.brand}
                  </p>
                  <p className="mt-1 font-semibold">${product.price}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 10: Clients Page

**File:** `src/app/(dashboard)/clients/page.tsx`

```typescript
'use client';

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-muted-foreground">
            Manage your client relationships
          </p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Add Client
        </button>
      </div>

      {/* Client list table */}
      <div className="rounded-lg border">
        <table className="w-full">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="p-4 text-left">Name</th>
              <th className="p-4 text-left">Email</th>
              <th className="p-4 text-left">Projects</th>
              <th className="p-4 text-left">Last Activity</th>
              <th className="p-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Client rows */}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Phase 3: UI Components (Ongoing)

### Essential Components to Build

1. **Button** (`src/components/ui/button.tsx`)
2. **Input** (`src/components/ui/input.tsx`)
3. **Modal/Dialog** (`src/components/ui/dialog.tsx`)
4. **Table** (`src/components/ui/table.tsx`)
5. **Card** (`src/components/ui/card.tsx`)
6. **Badge** (`src/components/ui/badge.tsx`)
7. **Dropdown** (`src/components/ui/dropdown.tsx`)
8. **Tabs** (`src/components/ui/tabs.tsx`)
9. **Form** (`src/components/ui/form.tsx`)
10. **Toast/Notification** (`src/components/ui/toast.tsx`)

### Component Library Option

Consider using shadcn/ui for rapid development:

```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input dialog table card badge dropdown-menu tabs form toast
```

---

## Phase 4: Testing (Week 6)

### Unit Tests Example

**File:** `src/hooks/__tests__/use-search.test.ts`

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearch } from '../use-search';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useSearch', () => {
  it('should fetch search results', async () => {
    const { result } = renderHook(
      () => useSearch({ q: 'test' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});
```

### E2E Tests Example

**File:** `e2e/catalog.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('catalog search flow', async ({ page }) => {
  // Login
  await page.goto('/auth/signin');
  await page.click('button:has-text("Sign in")');

  // Search
  await page.goto('/catalog');
  await page.fill('input[type="search"]', 'sofa');
  await page.press('input[type="search"]', 'Enter');

  // Verify results
  await expect(page.locator('[data-testid="product-card"]')).toHaveCount.toBeGreaterThan(0);
});
```

---

## Utility Functions to Create

### File: `src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
```

---

## Performance Checklist

- [ ] Enable React Compiler (when stable)
- [ ] Implement route-based code splitting
- [ ] Add loading states with Suspense
- [ ] Optimize images with next/image
- [ ] Implement virtual scrolling for long lists
- [ ] Add service worker for offline support
- [ ] Monitor bundle size with @next/bundle-analyzer
- [ ] Implement request deduplication
- [ ] Add optimistic UI updates
- [ ] Cache static data with React Query

---

## Security Checklist

- [ ] Implement CSRF protection
- [ ] Add rate limiting
- [ ] Sanitize user inputs
- [ ] Implement CSP headers
- [ ] Add XSS protection
- [ ] Secure session cookies
- [ ] Implement RBAC checks
- [ ] Add audit logging
- [ ] Implement file upload restrictions
- [ ] Add API request signing

---

## Deployment Checklist

- [ ] Configure CI/CD pipeline
- [ ] Setup staging environment
- [ ] Configure monitoring (OCI APM)
- [ ] Setup error tracking
- [ ] Configure analytics
- [ ] Add health check endpoint
- [ ] Configure backup strategy
- [ ] Document rollback procedure
- [ ] Setup feature flags
- [ ] Configure CDN caching

---

## Resources

- [Next.js 15 Documentation](https://nextjs.org/docs)
- [React Query Documentation](https://tanstack.com/query/latest)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Playwright Documentation](https://playwright.dev/)
- [OCI Identity Domains](https://docs.oracle.com/en-us/iaas/Content/Identity/home.htm)

---

**Last Updated:** 2025-10-03
**Team:** Juliet - Designer Portal Implementation Team
