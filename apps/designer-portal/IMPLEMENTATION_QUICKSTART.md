# Designer Portal - Implementation Quick Start Guide

**Team:** Foxtrot2 - Designer Portal UI Implementation
**Timeline:** Start immediately, 6-week delivery
**Last Updated:** 2025-10-03

---

## Getting Started (Day 1 - Hours 1-2)

### 1. Environment Setup

```bash
# Navigate to designer portal
cd /home/middle/patina/apps/designer-portal

# Install dependencies (if not already done)
pnpm install

# Create environment file
cp .env.example .env.local

# Edit .env.local with your values
nano .env.local
```

**Required Environment Variables:**
```bash
# OCI Identity Domains (get from team lead)
NEXT_PUBLIC_OIDC_ISSUER=https://idcs-xxx.identity.oraclecloud.com
NEXT_PUBLIC_OIDC_CLIENT_ID=your-client-id-here
OIDC_CLIENT_SECRET=your-client-secret-here
NEXT_PUBLIC_OIDC_REDIRECT_URI=http://localhost:3000/api/auth/callback/oci-identity-domains

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

# Backend Service URLs (use local or staging)
NEXT_PUBLIC_CATALOG_API_URL=http://localhost:3003
NEXT_PUBLIC_STYLE_PROFILE_API_URL=http://localhost:3001
NEXT_PUBLIC_SEARCH_API_URL=http://localhost:3002
NEXT_PUBLIC_ORDERS_API_URL=http://localhost:3005
NEXT_PUBLIC_COMMS_API_URL=http://localhost:3006
NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3007

# Feature Flags
NEXT_PUBLIC_ENABLE_PROPOSALS=true
NEXT_PUBLIC_ENABLE_TEACHING=true
NEXT_PUBLIC_ENABLE_MESSAGING=true
```

**Generate NextAuth Secret:**
```bash
openssl rand -base64 32
```

### 2. Install Authentication Dependencies

```bash
pnpm add next-auth@beta @auth/core
```

### 3. Verify Backend Services

```bash
# Check if services are running
curl http://localhost:3001/health  # Style Profile
curl http://localhost:3002/health  # Search
curl http://localhost:3003/health  # Catalog
curl http://localhost:3005/health  # Orders
curl http://localhost:3006/health  # Comms
curl http://localhost:3007/health  # Projects

# If not running, start them
cd /home/middle/patina/services
docker-compose up -d
```

### 4. Start Development Server

```bash
cd /home/middle/patina/apps/designer-portal
pnpm dev

# Open browser at http://localhost:3000
```

---

## Day 1: Authentication Implementation (Hours 2-8)

### Step 1: Create Auth Configuration

**File:** `/src/lib/auth.ts`

```typescript
import NextAuth, { NextAuthConfig } from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    user: {
      id: string;
      email: string;
      name: string;
      roles: string[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string;
    idToken: string;
    roles: string[];
  }
}

export const authConfig: NextAuthConfig = {
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
          scope: 'openid profile email',
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          roles: profile.roles || ['designer'],
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token!;
        token.idToken = account.id_token!;
        token.roles = (profile as any).roles || ['designer'];
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.id = token.sub!;
      session.user.roles = token.roles;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

### Step 2: Create Auth API Route

**File:** `/src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
```

### Step 3: Create Auth Middleware

**File:** `/src/middleware.ts`

```typescript
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth');
  const isPublicPage = req.nextUrl.pathname === '/';

  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

### Step 4: Create Sign-In Page

**File:** `/src/app/auth/signin/page.tsx`

```typescript
import { signIn } from '@/lib/auth';
import { Button } from '@patina/design-system';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Patina Designer Portal</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to access your account
          </p>
        </div>

        <form
          action={async () => {
            'use server';
            await signIn('oci-identity-domains', { redirectTo: '/dashboard' });
          }}
        >
          <Button type="submit" className="w-full" size="lg">
            Sign in with OCI Identity Domains
          </Button>
        </form>
      </div>
    </div>
  );
}
```

### Step 5: Test Authentication

```bash
# Start dev server
pnpm dev

# Navigate to http://localhost:3000
# Should redirect to /auth/signin
# Click sign in button
# Should redirect to OCI Identity Domains
# After auth, should redirect to /dashboard
```

---

## Day 2: Layout & Navigation (Hours 1-8)

### Step 1: Create Utility Functions

**File:** `/src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

export function formatDate(date: string | Date): string {
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

### Step 2: Create Navigation Component

**File:** `/src/components/layout/nav.tsx`

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  HomeIcon,
  UsersIcon,
  GridIcon,
  DocumentIcon,
  FolderIcon,
  ChatBubbleLeftIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Clients', href: '/clients', icon: UsersIcon },
  { name: 'Catalog', href: '/catalog', icon: GridIcon },
  { name: 'Proposals', href: '/proposals', icon: DocumentIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Messages', href: '/messages', icon: ChatBubbleLeftIcon },
  { name: 'Teaching', href: '/teaching', icon: AcademicCapIcon },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navigation.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
```

### Step 3: Create User Menu

**File:** `/src/components/layout/user-menu.tsx`

```typescript
'use client';

import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';
import { Button } from '@patina/design-system';

export function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm">
        <p className="font-medium text-gray-900">{session.user.name}</p>
        <p className="text-gray-500">{session.user.email}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => signOut({ callbackUrl: '/' })}
      >
        Sign out
      </Button>
    </div>
  );
}
```

### Step 4: Create Dashboard Layout

**File:** `/src/app/(dashboard)/layout.tsx`

```typescript
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Nav } from '@/components/layout/nav';
import { UserMenu } from '@/components/layout/user-menu';

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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <h1 className="text-xl font-bold text-gray-900">Patina</h1>
        </div>
        <div className="p-4">
          <Nav />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-gray-200 bg-white">
          <div className="flex h-full items-center justify-between px-8">
            <div className="text-lg font-semibold text-gray-900">
              Designer Portal
            </div>
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
```

### Step 5: Create Dashboard Page

**File:** `/src/app/(dashboard)/dashboard/page.tsx`

```typescript
import { auth } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back, {session?.user?.name}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Clients" value="12" />
        <StatCard title="Open Proposals" value="8" />
        <StatCard title="Active Projects" value="5" />
        <StatCard title="Unread Messages" value="23" />
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <p className="mt-2 text-sm text-gray-500">
          Your recent activity will appear here
        </p>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
```

### Step 6: Install Required Dependencies

```bash
pnpm add @heroicons/react
pnpm add next-auth # For useSession client hook
```

---

## Day 3-5: Core Pages Implementation

### Catalog Page

**File:** `/src/app/(dashboard)/catalog/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useSearch } from '@/hooks/use-search';
import { ProductGrid } from '@/components/catalog/product-grid';
import { SearchBar } from '@/components/catalog/search-bar';
import { FacetFilters } from '@/components/catalog/facet-filters';

export default function CatalogPage() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState('');

  const { data, isLoading } = useSearch({ q: query, filters });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Catalog</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse and search our product catalog
        </p>
      </div>

      <SearchBar value={query} onChange={setQuery} />

      <div className="grid gap-6 lg:grid-cols-4">
        <aside className="space-y-4">
          <FacetFilters value={filters} onChange={setFilters} />
        </aside>

        <div className="lg:col-span-3">
          <ProductGrid
            products={data?.results || []}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
```

### Clients Page

**File:** `/src/app/(dashboard)/clients/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@patina/design-system';

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your client relationships
          </p>
        </div>
        <Link href="/clients/new">
          <Button>Add Client</Button>
        </Link>
      </div>

      {/* Client list will go here */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                Name
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                Email
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                Projects
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                Last Activity
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                No clients yet. Add your first client to get started.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Proposals Page

**File:** `/src/app/(dashboard)/proposals/page.tsx`

```typescript
'use client';

import Link from 'next/link';
import { Button } from '@patina/design-system';

export default function ProposalsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Proposals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your client proposals
          </p>
        </div>
        <Link href="/proposals/new">
          <Button>New Proposal</Button>
        </Link>
      </div>

      {/* Proposal list will go here */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400">
          No proposals yet
        </div>
      </div>
    </div>
  );
}
```

---

## Testing Your Implementation

### Manual Testing Checklist

**Day 1 - Authentication:**
- [ ] Visit http://localhost:3000
- [ ] Redirected to /auth/signin
- [ ] Click "Sign in with OCI Identity Domains"
- [ ] Authenticate with OCI
- [ ] Redirected to /dashboard
- [ ] Session persists on refresh
- [ ] Sign out works

**Day 2 - Navigation:**
- [ ] Sidebar navigation visible
- [ ] All nav links work
- [ ] Active state highlights current page
- [ ] User menu displays name/email
- [ ] Dashboard shows stats cards

**Day 3-5 - Pages:**
- [ ] Catalog page loads
- [ ] Search input visible
- [ ] Clients page loads
- [ ] Proposals page loads
- [ ] All routes accessible

### Run Dev Server

```bash
pnpm dev

# Open http://localhost:3000
```

### Check for Errors

```bash
# Type check
pnpm type-check

# Linting
pnpm lint

# Build test
pnpm build
```

---

## Common Issues & Solutions

### Issue: OIDC Configuration Error

**Error:** `Provider "oci-identity-domains" not found`

**Solution:**
```bash
# Verify .env.local has correct values
cat .env.local | grep OIDC

# Restart dev server
pnpm dev
```

### Issue: API Connection Error

**Error:** `Failed to fetch from http://localhost:3001`

**Solution:**
```bash
# Start backend services
cd /home/middle/patina/services
docker-compose up -d

# Or start individual service
cd /home/middle/patina/services/style-profile
pnpm dev
```

### Issue: Module Not Found

**Error:** `Cannot find module '@patina/design-system'`

**Solution:**
```bash
# Reinstall dependencies
pnpm install

# Build design system
cd /home/middle/patina/packages/patina-design-system
pnpm build

# Back to designer portal
cd /home/middle/patina/apps/designer-portal
pnpm dev
```

### Issue: NextAuth Secret Missing

**Error:** `NEXTAUTH_SECRET is not set`

**Solution:**
```bash
# Generate secret
openssl rand -base64 32

# Add to .env.local
echo "NEXTAUTH_SECRET=<generated-secret>" >> .env.local

# Restart server
pnpm dev
```

---

## Next Steps After Quick Start

Once you have authentication and basic layout working:

1. **Week 1 (Days 3-5):** Complete base UI components
2. **Week 2:** Implement catalog search with hooks
3. **Week 3:** Build proposal board with drag-and-drop
4. **Week 4:** Style profile visualization & teaching
5. **Week 5:** Messaging & project tracking
6. **Week 6:** Testing, optimization, deployment

---

## Resources

### Documentation
- [Full Implementation Plan](./BLOCKER_002_RESOLUTION_PLAN.md)
- [Technical Specification](./TECHNICAL_SPECIFICATION.md)
- [Next Steps Guide](./NEXT_STEPS.md)
- [PRD](../../docs/features/08-designer-portal/Patina_Designer_Portal_PRD_OCI.md)

### API Documentation
- [API Endpoints](../../API_ENDPOINTS.md)
- [OpenAPI Specs](../../docs/api/)

### Design System
- [Design System README](../../packages/patina-design-system/README.md)
- [Component Guide](../../packages/patina-design-system/IMPLEMENTATION_GUIDE.md)

### Backend Services
- Style Profile: http://localhost:3001
- Search: http://localhost:3002
- Catalog: http://localhost:3003
- Orders: http://localhost:3005
- Comms: http://localhost:3006
- Projects: http://localhost:3007

---

## Support

**Team Lead:** Team Foxtrot2
**Slack Channel:** #designer-portal-dev
**Daily Standup:** 9:00 AM
**Code Reviews:** Required for all PRs

---

**Happy Coding! 🚀**

*Last Updated: 2025-10-03*
