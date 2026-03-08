# Designer Portal - Technical Specification

**Version:** 1.0
**Last Updated:** 2025-10-03
**Team:** Foxtrot2 - Designer Portal UI Implementation

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication Implementation](#authentication-implementation)
3. [State Management Strategy](#state-management-strategy)
4. [Component Architecture](#component-architecture)
5. [API Integration Patterns](#api-integration-patterns)
6. [Routing & Navigation](#routing--navigation)
7. [Data Flow Diagrams](#data-flow-diagrams)
8. [Performance Optimization](#performance-optimization)
9. [Testing Strategy](#testing-strategy)
10. [Security Implementation](#security-implementation)

---

## 1. Architecture Overview

### Application Structure

```
apps/designer-portal/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth routes (public)
│   │   │   ├── signin/
│   │   │   ├── signout/
│   │   │   └── error/
│   │   ├── (dashboard)/              # Protected routes
│   │   │   ├── layout.tsx           # Dashboard shell
│   │   │   ├── dashboard/           # Home dashboard
│   │   │   ├── clients/             # Client management
│   │   │   │   ├── page.tsx         # List view
│   │   │   │   ├── [id]/            # Detail view
│   │   │   │   └── new/             # Create client
│   │   │   ├── catalog/             # Product catalog
│   │   │   │   ├── page.tsx         # Search/browse
│   │   │   │   └── [id]/            # Product detail
│   │   │   ├── proposals/           # Proposal management
│   │   │   │   ├── page.tsx         # List view
│   │   │   │   ├── [id]/            # Board view
│   │   │   │   └── new/             # Create proposal
│   │   │   ├── projects/            # Project tracking
│   │   │   ├── messages/            # Communications
│   │   │   └── teaching/            # Teaching interface
│   │   ├── api/                     # API routes (BFF)
│   │   │   ├── auth/
│   │   │   └── webhooks/
│   │   ├── layout.tsx               # Root layout
│   │   ├── page.tsx                 # Landing page
│   │   └── globals.css
│   ├── components/                   # React components
│   │   ├── ui/                      # Base UI (from design system)
│   │   ├── layout/                  # Layout components
│   │   ├── catalog/                 # Catalog-specific
│   │   ├── proposals/               # Proposal components
│   │   ├── projects/                # Project components
│   │   ├── clients/                 # Client components
│   │   ├── teaching/                # Teaching components
│   │   └── messages/                # Messaging components
│   ├── hooks/                       # Custom React hooks
│   ├── lib/                         # Core libraries
│   │   ├── auth.ts                  # NextAuth config
│   │   ├── api-client.ts            # API clients
│   │   ├── react-query.ts           # React Query setup
│   │   ├── env.ts                   # Environment config
│   │   └── utils.ts                 # Utilities
│   ├── stores/                      # Zustand stores
│   │   ├── ui-store.ts              # UI state
│   │   └── draft-store.ts           # Draft proposals
│   ├── providers/                   # Context providers
│   └── types/                       # TypeScript types
├── public/                          # Static assets
├── e2e/                            # E2E tests
└── __tests__/                      # Unit tests
```

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | Next.js | 15.x | SSR, routing, API routes |
| React | React | 19.x | UI library |
| Language | TypeScript | 5.3.3 | Type safety |
| Styling | Tailwind CSS | 3.4 | Utility-first CSS |
| State (Server) | React Query | 5.x | Server state, caching |
| State (Client) | Zustand | 4.5 | Client state |
| Forms | React Hook Form | 7.x | Form management |
| Validation | Zod | 3.x | Schema validation |
| Auth | NextAuth.js | 5.x beta | OIDC authentication |
| Drag & Drop | @dnd-kit | 6.x | Proposal board |
| Testing | Jest + Playwright | Latest | Unit + E2E tests |
| Design System | @patina/design-system | Workspace | UI components |

---

## 2. Authentication Implementation

### NextAuth Configuration

**File:** `/src/lib/auth.ts`

```typescript
import NextAuth, { NextAuthConfig } from 'next-auth';
import { JWT } from 'next-auth/jwt';

// Extend the built-in session types
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
          roles: profile.roles || [],
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign in
      if (account && profile) {
        token.accessToken = account.access_token!;
        token.idToken = account.id_token!;
        token.roles = (profile as any).roles || [];
      }
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client
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
    maxAge: 24 * 60 * 60, // 24 hours
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

### Auth Middleware

**File:** `/src/middleware.ts`

```typescript
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth');
  const isPublicPage = req.nextUrl.pathname === '/';
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');

  // Allow API routes to handle their own auth
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Redirect unauthenticated users to sign in
  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

### Role-Based Access Control

**File:** `/src/lib/rbac.ts`

```typescript
import { Session } from 'next-auth';

export enum Role {
  DESIGNER = 'designer',
  ADMIN = 'admin',
  CLIENT = 'client',
}

export enum Permission {
  // Client management
  CREATE_CLIENT = 'create:client',
  VIEW_CLIENT = 'view:client',
  UPDATE_CLIENT = 'update:client',
  DELETE_CLIENT = 'delete:client',

  // Proposals
  CREATE_PROPOSAL = 'create:proposal',
  VIEW_PROPOSAL = 'view:proposal',
  UPDATE_PROPOSAL = 'update:proposal',
  DELETE_PROPOSAL = 'delete:proposal',
  SEND_PROPOSAL = 'send:proposal',

  // Teaching
  SUBMIT_TEACHING = 'submit:teaching',
  MANAGE_RULES = 'manage:rules',

  // Admin
  MANAGE_USERS = 'manage:users',
  VIEW_ANALYTICS = 'view:analytics',
}

const rolePermissions: Record<Role, Permission[]> = {
  [Role.DESIGNER]: [
    Permission.CREATE_CLIENT,
    Permission.VIEW_CLIENT,
    Permission.UPDATE_CLIENT,
    Permission.CREATE_PROPOSAL,
    Permission.VIEW_PROPOSAL,
    Permission.UPDATE_PROPOSAL,
    Permission.DELETE_PROPOSAL,
    Permission.SEND_PROPOSAL,
    Permission.SUBMIT_TEACHING,
    Permission.MANAGE_RULES,
  ],
  [Role.ADMIN]: Object.values(Permission),
  [Role.CLIENT]: [
    Permission.VIEW_PROPOSAL,
  ],
};

export function hasPermission(
  session: Session | null,
  permission: Permission
): boolean {
  if (!session?.user?.roles) return false;

  return session.user.roles.some((role) =>
    rolePermissions[role as Role]?.includes(permission)
  );
}

export function requirePermission(
  session: Session | null,
  permission: Permission
): void {
  if (!hasPermission(session, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}
```

---

## 3. State Management Strategy

### Server State (React Query)

All API data is managed with React Query:

```typescript
// Query key factory (already implemented in /src/lib/react-query.ts)
export const queryKeys = {
  // Catalog & Search
  products: {
    all: ['products'] as const,
    detail: (id: string) => [...queryKeys.products.all, id] as const,
    search: (params: SearchParams) => [...queryKeys.products.all, 'search', params] as const,
  },
  search: {
    all: ['search'] as const,
    query: (params: SearchParams) => [...queryKeys.search.all, 'query', params] as const,
    autocomplete: (q: string) => [...queryKeys.search.all, 'autocomplete', q] as const,
    similar: (productId: string) => [...queryKeys.search.all, 'similar', productId] as const,
  },
  // ... (other keys already defined)
};

// React Query configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

### Client State (Zustand)

**File:** `/src/stores/ui-store.ts`

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface UIState {
  // Modals
  isProductDetailOpen: boolean;
  selectedProductId: string | null;

  // Drawers
  isSidebarOpen: boolean;
  isFilterDrawerOpen: boolean;

  // Proposal board
  activeProposalId: string | null;

  // Actions
  openProductDetail: (productId: string) => void;
  closeProductDetail: () => void;
  toggleSidebar: () => void;
  toggleFilterDrawer: () => void;
  setActiveProposal: (proposalId: string | null) => void;
}

export const useUIStore = create<UIState>()(
  devtools((set) => ({
    // Initial state
    isProductDetailOpen: false,
    selectedProductId: null,
    isSidebarOpen: true,
    isFilterDrawerOpen: false,
    activeProposalId: null,

    // Actions
    openProductDetail: (productId) => set({
      isProductDetailOpen: true,
      selectedProductId: productId
    }),
    closeProductDetail: () => set({
      isProductDetailOpen: false,
      selectedProductId: null
    }),
    toggleSidebar: () => set((state) => ({
      isSidebarOpen: !state.isSidebarOpen
    })),
    toggleFilterDrawer: () => set((state) => ({
      isFilterDrawerOpen: !state.isFilterDrawerOpen
    })),
    setActiveProposal: (proposalId) => set({
      activeProposalId: proposalId
    }),
  }))
);
```

**File:** `/src/stores/draft-store.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProposalDraft {
  proposalId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    sectionId: string;
  }>;
  lastModified: string;
}

interface DraftState {
  drafts: Record<string, ProposalDraft>;
  saveDraft: (proposalId: string, items: ProposalDraft['items']) => void;
  getDraft: (proposalId: string) => ProposalDraft | undefined;
  clearDraft: (proposalId: string) => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafts: {},

      saveDraft: (proposalId, items) => set((state) => ({
        drafts: {
          ...state.drafts,
          [proposalId]: {
            proposalId,
            items,
            lastModified: new Date().toISOString(),
          },
        },
      })),

      getDraft: (proposalId) => get().drafts[proposalId],

      clearDraft: (proposalId) => set((state) => {
        const { [proposalId]: removed, ...rest } = state.drafts;
        return { drafts: rest };
      }),
    }),
    {
      name: 'patina-proposal-drafts',
    }
  )
);
```

---

## 4. Component Architecture

### Component Hierarchy

```
Page (Server Component)
├── Layout (Server Component)
│   ├── Header
│   ├── Sidebar
│   └── Main Content Area
└── Feature Components (Client Components)
    ├── Data Container (uses hooks)
    ├── Presentation Components
    └── UI Components (from design system)
```

### Component Patterns

#### 1. Server Components (Default)
Use for:
- Layouts
- Static content
- Data fetching (when not using React Query)

```typescript
// app/(dashboard)/clients/page.tsx
import { auth } from '@/lib/auth';
import { ClientList } from '@/components/clients/client-list';

export default async function ClientsPage() {
  const session = await auth();

  return (
    <div>
      <h1>Clients</h1>
      <ClientList designerId={session?.user?.id} />
    </div>
  );
}
```

#### 2. Client Components (Interactive)
Use for:
- Interactive UI
- React Query hooks
- State management
- Event handlers

```typescript
'use client';

import { useClients } from '@/hooks/use-clients';
import { ClientCard } from './client-card';

export function ClientList({ designerId }: { designerId: string }) {
  const { data: clients, isLoading } = useClients({ designerId });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {clients?.map((client) => (
        <ClientCard key={client.id} client={client} />
      ))}
    </div>
  );
}
```

#### 3. Compound Components
For complex UI with shared state:

```typescript
// components/proposals/proposal-board.tsx
'use client';

import { ProposalBoardProvider } from './proposal-board-context';

export function ProposalBoard({ proposalId }: { proposalId: string }) {
  return (
    <ProposalBoardProvider proposalId={proposalId}>
      <ProposalBoard.Header />
      <ProposalBoard.Sections />
      <ProposalBoard.Footer />
    </ProposalBoardProvider>
  );
}

ProposalBoard.Header = function ProposalBoardHeader() {
  const { proposal } = useProposalBoard();
  return <div>{proposal.title}</div>;
};

ProposalBoard.Sections = function ProposalBoardSections() {
  const { sections } = useProposalBoard();
  return <div>{/* Sections */}</div>;
};

ProposalBoard.Footer = function ProposalBoardFooter() {
  const { totalPrice } = useProposalBoard();
  return <div>Total: ${totalPrice}</div>;
};
```

---

## 5. API Integration Patterns

### Hook-Based Data Fetching

All API calls use custom React Query hooks:

```typescript
// hooks/use-clients.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query';

export function useClients(params: { designerId: string }) {
  return useQuery({
    queryKey: queryKeys.clients.list(params),
    queryFn: () => clientApi.getClients(params),
  });
}

export function useClient(clientId: string) {
  return useQuery({
    queryKey: queryKeys.clients.detail(clientId),
    queryFn: () => clientApi.getClient(clientId),
    enabled: !!clientId,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clientApi.createClient,
    onSuccess: () => {
      // Invalidate and refetch clients list
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      clientApi.updateClient(id, data),
    onMutate: async ({ id, data }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.clients.detail(id) });
      const previous = queryClient.getQueryData(queryKeys.clients.detail(id));

      queryClient.setQueryData(queryKeys.clients.detail(id), (old: any) => ({
        ...old,
        ...data,
      }));

      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.clients.detail(variables.id),
          context.previous
        );
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.clients.detail(variables.id)
      });
    },
  });
}
```

### Error Handling Pattern

```typescript
// components/catalog/product-search.tsx
'use client';

export function ProductSearch() {
  const [query, setQuery] = useState('');
  const { data, isLoading, error } = useSearch({ q: query });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Search Error</AlertTitle>
        <AlertDescription>
          {error.message || 'Failed to fetch search results'}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <SearchResultsSkeleton />;
  }

  return <SearchResults results={data} />;
}
```

### Loading States

```typescript
// Use Suspense boundaries
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DataComponent />
    </Suspense>
  );
}

// Or use isLoading from React Query
function DataComponent() {
  const { data, isLoading } = useData();

  if (isLoading) return <Skeleton />;
  return <Content data={data} />;
}
```

---

## 6. Routing & Navigation

### Route Groups

```
app/
├── (auth)/          # Public auth routes
├── (dashboard)/     # Protected app routes
└── (marketing)/     # Public marketing (future)
```

### Dynamic Routes

```typescript
// app/(dashboard)/clients/[id]/page.tsx
export default function ClientDetailPage({
  params
}: {
  params: { id: string }
}) {
  return <ClientDetail clientId={params.id} />;
}

// app/(dashboard)/proposals/[id]/page.tsx
export default function ProposalPage({
  params
}: {
  params: { id: string }
}) {
  return <ProposalBoard proposalId={params.id} />;
}
```

### Navigation Component

```typescript
// components/layout/nav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Clients', href: '/clients', icon: UsersIcon },
  { name: 'Catalog', href: '/catalog', icon: GridIcon },
  { name: 'Proposals', href: '/proposals', icon: DocumentIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Messages', href: '/messages', icon: MessageIcon },
  { name: 'Teaching', href: '/teaching', icon: AcademicCapIcon },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navigation.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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

---

## 7. Data Flow Diagrams

### Catalog Search Flow

```
User Input (Search Query)
    ↓
[Debounced State Update] (300ms)
    ↓
[useSearch Hook]
    ↓
[React Query] → Check Cache
    ↓ (cache miss)
[API Client] → GET /v1/search?q=...
    ↓
[Search Service] → OpenSearch
    ↓
[API Response] → Cache in React Query
    ↓
[UI Update] → Display Results
```

### Proposal Creation Flow

```
User Action (Create Proposal)
    ↓
[Proposal Form] → Validation (Zod)
    ↓
[useCreateProposal Hook]
    ↓
[Optimistic Update] → Show in UI immediately
    ↓
[API Client] → POST /v1/proposals
    ↓
[Proposals Service] → Save to DB
    ↓
[Success Response]
    ↓
[React Query] → Invalidate cache, refetch list
    ↓
[Redirect] → Navigate to proposal board
```

### Teaching Feedback Flow

```
User Action (Approve Product)
    ↓
[Product Card] → Click approve button
    ↓
[useAddSignals Hook]
    ↓
[Optimistic UI] → Show approved state
    ↓
[API Client] → POST /v1/style-profiles/:id/signals
    ↓
[Style Profile Service] → Queue for recompute
    ↓
[Success Response]
    ↓
[Event Emitted] → profile.signals.added
    ↓
[Aesthete Engine] → Receives event, recomputes
    ↓
[Cache Invalidation] → Recommendations updated
```

---

## 8. Performance Optimization

### Code Splitting Strategy

```typescript
// Lazy load heavy components
import dynamic from 'next/dynamic';

const ProposalBoard = dynamic(
  () => import('@/components/proposals/proposal-board'),
  {
    loading: () => <BoardSkeleton />,
    ssr: false
  }
);

const ProductDetailModal = dynamic(
  () => import('@/components/catalog/product-detail-modal'),
  { ssr: false }
);
```

### Image Optimization

```typescript
import Image from 'next/image';

export function ProductImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={400}
      height={400}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      quality={85}
      loading="lazy"
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,..."
    />
  );
}
```

### Virtual Scrolling

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

export function ProductGrid({ products }: { products: Product[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <ProductCard product={products[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Debounced Search

```typescript
import { useDebouncedValue } from '@/hooks/use-debounced-value';

export function SearchInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);

  const { data } = useSearch({ q: debouncedQuery });

  return (
    <input
      type="search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search products..."
    />
  );
}
```

---

## 9. Testing Strategy

### Unit Tests (Jest + React Testing Library)

```typescript
// __tests__/components/catalog/product-card.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductCard } from '@/components/catalog/product-card';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('ProductCard', () => {
  const mockProduct = {
    id: '1',
    name: 'Modern Sofa',
    brand: 'West Elm',
    price: 1299.99,
    imageUrl: '/sofa.jpg',
  };

  it('renders product information', () => {
    renderWithProviders(<ProductCard product={mockProduct} />);

    expect(screen.getByText('Modern Sofa')).toBeInTheDocument();
    expect(screen.getByText('West Elm')).toBeInTheDocument();
    expect(screen.getByText('$1,299.99')).toBeInTheDocument();
  });

  it('handles add to proposal click', () => {
    const onAddToProposal = jest.fn();
    renderWithProviders(
      <ProductCard product={mockProduct} onAddToProposal={onAddToProposal} />
    );

    fireEvent.click(screen.getByText('Add to Proposal'));
    expect(onAddToProposal).toHaveBeenCalledWith(mockProduct);
  });
});
```

### Integration Tests (MSW)

```typescript
// __tests__/hooks/use-search.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { useSearch } from '@/hooks/use-search';
import { createWrapper } from '../test-utils';

const server = setupServer(
  rest.get('/api/search/v1/search', (req, res, ctx) => {
    return res(
      ctx.json({
        data: {
          results: [
            { id: '1', name: 'Product 1' },
            { id: '2', name: 'Product 2' },
          ],
          total: 2,
        },
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useSearch', () => {
  it('fetches search results', async () => {
    const { result } = renderHook(
      () => useSearch({ q: 'sofa' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.results).toHaveLength(2);
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/catalog-search.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Catalog Search', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'designer@test.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('search for products', async ({ page }) => {
    // Navigate to catalog
    await page.goto('/catalog');

    // Enter search query
    await page.fill('input[type="search"]', 'walnut sofa');
    await page.press('input[type="search"]', 'Enter');

    // Wait for results
    await page.waitForSelector('[data-testid="product-card"]');

    // Verify results
    const productCards = await page.$$('[data-testid="product-card"]');
    expect(productCards.length).toBeGreaterThan(0);

    // Verify search term is highlighted
    await expect(page.locator('text=walnut')).toBeVisible();
  });

  test('apply filters', async ({ page }) => {
    await page.goto('/catalog');

    // Open filters
    await page.click('button[aria-label="Filters"]');

    // Select category
    await page.check('input[name="category"][value="sofas"]');

    // Set price range
    await page.fill('input[name="minPrice"]', '1000');
    await page.fill('input[name="maxPrice"]', '5000');

    // Apply
    await page.click('button:has-text("Apply Filters")');

    // Verify URL updated
    expect(page.url()).toContain('filters=category:sofas,price.gte:100000');

    // Verify results filtered
    await page.waitForSelector('[data-testid="product-card"]');
    const results = await page.$$('[data-testid="product-card"]');
    expect(results.length).toBeGreaterThan(0);
  });

  test('add product to proposal', async ({ page }) => {
    await page.goto('/catalog');

    // Search for product
    await page.fill('input[type="search"]', 'chair');
    await page.press('input[type="search"]', 'Enter');
    await page.waitForSelector('[data-testid="product-card"]');

    // Click add to proposal on first product
    await page.click('[data-testid="product-card"]:first-child button:has-text("Add to Proposal")');

    // Select proposal from modal
    await page.waitForSelector('[role="dialog"]');
    await page.click('[role="dialog"] button:has-text("Living Room Proposal")');

    // Verify success toast
    await expect(page.locator('text=Added to proposal')).toBeVisible();

    // Navigate to proposal and verify
    await page.goto('/proposals/living-room-proposal-id');
    await expect(page.locator('text=chair')).toBeVisible();
  });
});
```

---

## 10. Security Implementation

### Content Security Policy

**File:** `/src/middleware.ts` (add to existing)

```typescript
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self' data:;
      connect-src 'self' https://api.patina.com;
      frame-ancestors 'none';
    `.replace(/\\s{2,}/g, ' ').trim(),
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

response.headers.append(header.key, header.value);
```

### Input Validation

```typescript
import { z } from 'zod';

// Schema for client creation
export const createClientSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  email: z.string().email('Invalid email'),
  phone: z.string().regex(/^\\+?[1-9]\\d{1,14}$/, 'Invalid phone').optional(),
  budget: z.number().min(0).max(10000000).optional(),
  constraints: z.array(z.string()).max(10).optional(),
});

// Use in form
export function CreateClientForm() {
  const form = useForm({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      budget: undefined,
      constraints: [],
    },
  });

  const createClient = useCreateClient();

  const onSubmit = (data: z.infer<typeof createClientSchema>) => {
    createClient.mutate(data);
  };

  return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>;
}
```

### API Request Signing

```typescript
// lib/api-client.ts (extend BaseApiClient)
class SecureApiClient extends BaseApiClient {
  private signRequest(config: AxiosRequestConfig): AxiosRequestConfig {
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const signature = this.generateSignature(config.url!, timestamp, nonce);

    config.headers = {
      ...config.headers,
      'X-Request-Timestamp': timestamp,
      'X-Request-Nonce': nonce,
      'X-Request-Signature': signature,
    };

    return config;
  }

  private generateSignature(url: string, timestamp: number, nonce: string): string {
    // HMAC-SHA256 signature
    const message = `${url}:${timestamp}:${nonce}`;
    const secret = process.env.API_SECRET!;
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }
}
```

### Audit Logging

```typescript
// lib/audit.ts
export async function logAuditEvent(event: {
  action: string;
  resource: string;
  resourceId: string;
  userId: string;
  metadata?: Record<string, any>;
}) {
  await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ip: 'server-determined',
    }),
  });
}

// Usage
export function useDeleteClient() {
  return useMutation({
    mutationFn: clientApi.deleteClient,
    onSuccess: (data, clientId) => {
      logAuditEvent({
        action: 'DELETE',
        resource: 'client',
        resourceId: clientId,
        userId: session.user.id,
      });
    },
  });
}
```

---

## Implementation Checklist

### Week 11: Authentication & Layout
- [ ] Install NextAuth and configure OIDC
- [ ] Create auth middleware
- [ ] Build auth pages (signin, signout, error)
- [ ] Implement RBAC utility
- [ ] Create navigation component
- [ ] Build dashboard layout
- [ ] Create base UI components
- [ ] Add security headers

### Week 12-13: Core Features
- [ ] Dashboard page with metrics
- [ ] Client management module
- [ ] Catalog search and browse
- [ ] Proposal builder
- [ ] Drag-and-drop implementation
- [ ] PDF export functionality

### Week 14-15: Advanced Features
- [ ] Style profile visualization
- [ ] Teaching interface
- [ ] Messaging system
- [ ] Project tracking integration
- [ ] Real-time updates (polling/WebSocket)

### Week 16: Polish & Testing
- [ ] Responsive design refinement
- [ ] Performance optimization
- [ ] Unit test coverage >80%
- [ ] E2E critical paths
- [ ] Accessibility audit
- [ ] Documentation complete

---

**Last Updated:** 2025-10-03
**Next Review:** End of Week 11
