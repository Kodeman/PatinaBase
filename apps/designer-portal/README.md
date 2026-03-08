# Patina Designer Portal

The primary web application for interior designers to manage clients, create proposals, browse the catalog, and collaborate on projects.

## Overview

The Designer Portal is a production-ready Next.js 15 application that provides designers with:

- **Client Management:** Track client profiles, style preferences, and project history
- **Catalog Browsing:** Search and filter products with advanced AI-powered recommendations
- **Proposal Creation:** Build beautiful, curated product collections for clients
- **Teaching Interface:** Fine-tune recommendations through explicit feedback
- **Project Tracking:** Manage tasks, RFIs, change orders, and project execution
- **Communications:** Real-time messaging with clients and team members

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **React:** 19.x
- **TypeScript:** 5.3.3 (strict mode)
- **Styling:** Tailwind CSS 3.4
- **State Management:**
  - React Query v5 (server state)
  - Zustand (client state)
- **API Client:** Axios with custom wrappers
- **Testing:** Jest + React Testing Library + Playwright
- **Monorepo:** Turborepo with pnpm workspaces

## Getting Started

### Prerequisites

- Node.js 20.x or later
- pnpm 8.x or later
- Access to OCI Identity Domains for OIDC authentication

### Installation

From the repository root:

```bash
# Install dependencies
pnpm install

# Navigate to designer portal
cd apps/designer-portal
```

### Environment Configuration

1. Copy the example environment file:
```bash
cp .env.example .env.local
```

2. Configure the required variables:

```bash
# API Service URLs
NEXT_PUBLIC_CATALOG_API_URL=http://localhost:3003
NEXT_PUBLIC_STYLE_PROFILE_API_URL=http://localhost:3001
NEXT_PUBLIC_SEARCH_API_URL=http://localhost:3002
NEXT_PUBLIC_ORDERS_API_URL=http://localhost:3005
NEXT_PUBLIC_COMMS_API_URL=http://localhost:3006
NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3007

# OCI Identity Domains (OIDC)
NEXT_PUBLIC_OIDC_ISSUER=https://idcs-xxx.identity.oraclecloud.com
NEXT_PUBLIC_OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_OIDC_REDIRECT_URI=http://localhost:3000/auth/callback

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

# Feature Flags
NEXT_PUBLIC_ENABLE_PROPOSALS=true
NEXT_PUBLIC_ENABLE_TEACHING=true
NEXT_PUBLIC_ENABLE_MESSAGING=true
```

### Development

```bash
# Start the development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run type checking
pnpm type-check

# Run linting
pnpm lint
pnpm lint:fix

# Run tests
pnpm test
pnpm test:watch
pnpm test:coverage

# Run E2E tests
pnpm test:e2e
```

## Project Structure

```
src/
├── app/                      # Next.js 15 App Router
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Home page
│   ├── globals.css          # Global styles
│   ├── (auth)/              # Authentication routes
│   ├── (dashboard)/         # Protected dashboard routes
│   │   ├── dashboard/       # Main dashboard
│   │   ├── clients/         # Client management
│   │   ├── catalog/         # Product catalog
│   │   ├── proposals/       # Proposal management
│   │   ├── projects/        # Project tracking
│   │   └── messages/        # Communications
│   └── api/                 # API routes (BFF pattern)
├── components/              # React components
│   ├── ui/                  # Base UI components
│   ├── catalog/             # Catalog-specific components
│   ├── proposals/           # Proposal components
│   ├── projects/            # Project components
│   └── layout/              # Layout components (nav, header, etc.)
├── hooks/                   # Custom React hooks
│   ├── use-search.ts        # Product search hooks
│   ├── use-style-profile.ts # Style profile hooks
│   ├── use-projects.ts      # Project hooks
│   └── use-comms.ts         # Communication hooks
├── lib/                     # Core libraries
│   ├── env.ts               # Environment configuration
│   ├── api-client.ts        # API client instances
│   └── react-query.ts       # React Query configuration
├── providers/               # React context providers
│   └── react-query-provider.tsx
└── types/                   # TypeScript type definitions
```

## Architecture

### API Integration

The portal communicates with multiple backend services:

- **Catalog Service** (3003): Product and variant data
- **Search Service** (3002): Full-text search, autocomplete, similarity
- **Style Profile Service** (3001): Client profiles, quiz, behavioral signals
- **Orders Service** (3005): Cart, checkout, order management
- **Comms Service** (3006): Messages, threads, notifications
- **Projects Service** (3007): Tasks, RFIs, change orders

All API clients are type-safe and include:
- Automatic authentication token injection
- Request/response interceptors
- Error handling with typed errors
- Request ID generation for tracing
- Retry logic for failed requests

### State Management

**Server State (React Query)**
- Product catalog and search results
- Client data and style profiles
- Proposals and projects
- Messages and threads
- Automatic caching and invalidation
- Optimistic updates

**Client State (Zustand)**
- UI state (modals, drawers)
- Form state
- Temporary selections

### Authentication

Uses **OCI Identity Domains** via OIDC:
1. User initiates sign-in
2. Redirects to OCI Identity Domains
3. User authenticates with MFA
4. Returns with authorization code
5. Exchange for ID token and access token
6. Session managed via NextAuth

### Performance Optimizations

- **Code Splitting:** Route-based automatic splitting
- **Image Optimization:** Next.js Image component with AVIF/WebP
- **Font Optimization:** Self-hosted Inter font with variable weights
- **API Caching:** React Query with 5-minute stale time
- **Request Deduplication:** Automatic via React Query
- **Lazy Loading:** Components and routes loaded on-demand

## Features

### Dashboard
- Recent clients and proposals
- Teaching impact summary
- Quick actions (new client, new proposal)
- Activity feed
- Alerts and notifications

### Clients
- List all clients with filters
- Client detail view
  - Style profile visualization
  - Room scans (3D viewer)
  - Proposals history
  - Message threads

### Catalog
- Advanced search with facets
- Sort by relevance, price, newest
- Save to proposal (drag & drop)
- Quick feedback (approve/reject/similar)
- Product detail drawer
- Similar products recommendations

### Proposals
- Board view with sections
- Drag & drop item management
- Budget tracking and totals
- Version history and diff view
- Export to PDF/CSV
- Send for client approval
- Comments and annotations

### Teaching Interface
- Inline approve/reject/replace actions
- Bulk label application
- Rule builder integration
- Impact preview

### Projects
- Kanban board view
- Task management with assignments
- RFI workflow
- Change order requests
- Issue tracking
- Daily logs with photo upload

### Messages
- Thread list by client/proposal/project
- Real-time message updates
- File attachments
- Read receipts
- Typing indicators (future)

## API Hooks

### Search
```typescript
const { data, isLoading } = useSearch({
  q: 'walnut sofa',
  filters: 'category:sofas,price.gte:50000',
  limit: 24,
  sort: 'relevance'
});

const { data: suggestions } = useAutocomplete(query);

const { data: similar } = useSimilarProducts(productId);
```

### Style Profiles
```typescript
const { data: profile } = useStyleProfile(profileId);
const { data: versions } = useStyleProfileVersions(profileId);

const { mutate: updateProfile } = useUpdateStyleProfile();
const { mutate: completeQuiz } = useCompleteQuiz();
const { mutate: addSignals } = useAddSignals();
```

### Projects
```typescript
const { data: projects } = useProjects({ designerId });
const { data: project } = useProject(projectId);

const { mutate: createTask } = useCreateTask();
const { mutate: createRFI } = useCreateRFI();
const { mutate: createChangeOrder } = useCreateChangeOrder();
```

### Communications
```typescript
const { data: threads } = useThreads({ scope: `proposal:${id}` });
const { data: thread } = useThread(threadId);

const { mutate: sendMessage } = useSendMessage();
const { mutate: markRead } = useMarkRead();
```

## Testing

### Unit Tests
```bash
# Run all unit tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### E2E Tests
```bash
# Run Playwright tests
pnpm test:e2e

# Open Playwright UI
pnpm playwright test --ui

# Debug mode
pnpm playwright test --debug
```

## Deployment

### Build

```bash
# Production build
pnpm build

# Analyze bundle size
ANALYZE=true pnpm build
```

### Docker

```bash
# Build image
docker build -t patina-designer-portal .

# Run container
docker run -p 3000:3000 patina-designer-portal
```

### Environment Variables (Production)

Required environment variables for production deployment:

- `NEXT_PUBLIC_OIDC_ISSUER`
- `NEXT_PUBLIC_OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- All service API URLs

## Performance Targets

Per the PRD requirements:

- **LCP:** ≤ 2.5s (Largest Contentful Paint)
- **TTI:** ≤ 3.5s (Time to Interactive)
- **CLS:** < 0.1 (Cumulative Layout Shift)
- **Search API:** p95 < 300ms
- **Proposals Read:** p95 < 200ms
- **Proposals Write:** p95 < 400ms

## Security

### Authentication
- OIDC with OCI Identity Domains
- JWT token-based authorization
- Automatic token refresh
- Session management via NextAuth

### Data Protection
- HTTPS only in production
- Secure cookie flags
- CSRF protection
- XSS protection via React
- Content Security Policy headers

### RBAC
- Designer role required for most features
- Client-scoped data access
- Admin override capabilities
- Audit logging for privileged actions

## Troubleshooting

### Common Issues

**API Connection Errors**
```bash
# Check service URLs in .env.local
# Verify backend services are running
docker-compose up -d
```

**Authentication Issues**
```bash
# Verify OIDC configuration
# Check Identity Domains settings
# Regenerate NextAuth secret if needed
openssl rand -base64 32
```

**Build Errors**
```bash
# Clear Next.js cache
pnpm clean

# Reinstall dependencies
rm -rf node_modules
pnpm install
```

## Contributing

### Code Style
- TypeScript strict mode enforced
- ESLint with Next.js config
- Prettier for formatting
- Conventional commits

### Pull Request Process
1. Create feature branch
2. Implement changes with tests
3. Run `pnpm lint` and `pnpm type-check`
4. Submit PR with description
5. Wait for CI checks to pass
6. Request review from team

## Related Documentation

- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
- [API Endpoints](../../API_ENDPOINTS.md)
- [PRD: Designer Portal](../../docs/features/08-designer-portal/)
- [PRD: Product Catalog](../../docs/features/02-product-catalog/)
- [PRD: Style Profile](../../docs/features/03-style-profile/)
- [PRD: Project Tracking](../../docs/features/11-project-tracking/)

## License

Copyright © 2025 Patina. All rights reserved.

---

**Status:** Foundation Complete, Core Features In Progress
**Last Updated:** 2025-10-03
**Team:** Juliet - Designer Portal Implementation Team
