# Patina Admin Portal

The Patina Admin Portal is a comprehensive Next.js 15 application for platform operators and administrators to manage users, designers, catalog, media, orders, search configuration, and system health.

## Features

### User Management
- User search and filtering by status, role, and email
- Role assignment with RBAC (Role-Based Access Control)
- Session management and revocation
- User suspension and ban capabilities
- Comprehensive audit logging

### Designer Verification
- Review designer applications
- Document verification with PAR-protected access
- Approve/reject workflow with notes
- Re-verification scheduling
- SLA tracking

### Catalog Management
- Product CRUD operations
- Bulk import with CSV validation
- Variant management
- Category hierarchy management
- Publish/unpublish workflow
- Validation issue dashboard

### Media Management
- Asset browser with grid/list views
- Quality control interface
- License and rights management
- 3D asset inspection (triangle count, materials, AR readiness)
- Reprocessing and orphan cleanup
- Processing job monitoring

### Order Management
- Order search and advanced filtering
- Order detail with timeline view
- Refund processing (full/partial)
- Shipment tracking updates
- Payment reconciliation dashboard

### Search Administration
- Synonym management with locale support
- Field boost configuration
- Reindex orchestration with progress tracking
- Alias swap (blue/green deployment)
- Query console for testing
- Zero-results analytics

### System Administration
- Real-time health dashboards for all services
- SLO monitoring and alerting
- Event outbox monitoring
- Background job status tracking
- Configuration management

### Privacy Operations
- GDPR/CCPA compliance tooling
- Data subject request (DSR) workflows
- Export and deletion queues
- Legal hold management
- Consent tracking

### Analytics & Reporting
- User growth charts
- Product performance metrics
- Order analytics and revenue reports
- System usage statistics

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **UI**: React 19, TypeScript 5.5
- **Styling**: Tailwind CSS with custom admin theme
- **Components**: Radix UI primitives
- **Forms**: React Hook Form + Zod validation
- **Data Fetching**: React Query v5
- **Charts**: Recharts
- **Icons**: Lucide React
- **Notifications**: Sonner

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- pnpm 9.x or higher
- Access to OCI Identity Domains for OIDC
- Backend services running (user-management, catalog, media, orders, search)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Update .env with your configuration
```

### Environment Variables

Configure the following in your `.env` file:

```bash
# OCI Identity Domains Configuration
NEXT_PUBLIC_OIDC_ISSUER=https://idcs-xxx.identity.oraclecloud.com
NEXT_PUBLIC_OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_OIDC_REDIRECT_URI=http://localhost:3001/api/auth/callback

# API Configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_API_GATEWAY_URL=https://api-gateway.oraclecloud.com

# Service URLs
NEXT_PUBLIC_USER_SERVICE_URL=http://localhost:3100
NEXT_PUBLIC_CATALOG_SERVICE_URL=http://localhost:3200
NEXT_PUBLIC_MEDIA_SERVICE_URL=http://localhost:3300
NEXT_PUBLIC_ORDERS_SERVICE_URL=http://localhost:3400
NEXT_PUBLIC_SEARCH_SERVICE_URL=http://localhost:3500

# Session Configuration
SESSION_SECRET=your-session-secret-min-32-chars
SESSION_COOKIE_NAME=patina_admin_session
SESSION_MAX_AGE=28800

# Feature Flags
NEXT_PUBLIC_ENABLE_MFA=true
NEXT_PUBLIC_ENABLE_DUAL_CONTROL=true
NEXT_PUBLIC_ENABLE_IMPERSONATION=false
```

### Development

```bash
# Start development server (runs on port 3001)
pnpm dev

# Type checking
pnpm type-check

# Linting
pnpm lint

# Build for production
pnpm build

# Start production server
pnpm start
```

### Testing

```bash
# Run unit tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# E2E tests with Playwright
pnpm test:e2e
```

## Architecture

### Directory Structure

```
src/
├── app/
│   ├── (dashboard)/          # Dashboard layout group
│   │   ├── dashboard/        # Main dashboard
│   │   ├── users/            # User management
│   │   ├── verification/     # Designer verification
│   │   ├── catalog/          # Product catalog
│   │   ├── media/            # Media management
│   │   ├── orders/           # Order management
│   │   ├── search/           # Search configuration
│   │   ├── privacy/          # Privacy operations
│   │   ├── flags/            # Feature flags
│   │   ├── health/           # System health
│   │   ├── analytics/        # Analytics
│   │   └── audit/            # Audit logs
│   ├── api/                  # API routes
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Home redirect
├── components/
│   ├── layout/               # Layout components
│   ├── ui/                   # Reusable UI components
│   └── providers.tsx         # Context providers
├── lib/
│   ├── api-client.ts         # API client wrapper
│   └── utils.ts              # Utility functions
├── services/
│   ├── users.ts              # User service
│   ├── catalog.ts            # Catalog service
│   ├── media.ts              # Media service
│   ├── orders.ts             # Orders service
│   ├── search.ts             # Search service
│   └── system.ts             # System service
└── types/
    └── index.ts              # TypeScript types
```

### Authentication & Authorization

The admin portal uses OIDC authentication through OCI Identity Domains. All admin routes are protected and require authentication. RBAC is enforced at the API level with the following roles:

- `viewer`: Read-only access
- `support`: Read access + limited write operations
- `catalog_admin`: Full catalog management
- `designer_admin`: Designer verification
- `search_admin`: Search configuration
- `privacy_admin`: Privacy operations
- `platform_admin`: Full system access

### Security Features

- **MFA Enforcement**: Multi-factor authentication required for admin roles
- **Dual Control**: High-risk operations require second approver
- **JIT Elevation**: Time-boxed privilege elevation with audit trail
- **Session Management**: Device tracking and remote session revocation
- **CSRF Protection**: Token-based CSRF protection on all mutations
- **Audit Logging**: Immutable audit trail for all privileged actions
- **Rate Limiting**: API rate limits per user and endpoint

### API Integration

All backend services are accessed through a centralized API client (`src/lib/api-client.ts`) with:

- Automatic JWT token injection
- Request/response interceptors
- Error handling and retry logic
- Type-safe responses

Service layer functions (`src/services/*`) provide domain-specific methods for each backend service.

### Data Fetching

React Query is used for all data fetching with:

- Automatic caching and background refetching
- Optimistic updates for mutations
- Query invalidation on related updates
- Loading and error states

## Key Workflows

### Designer Verification Workflow

1. Designer submits application with documents
2. Application appears in admin verification queue
3. Admin reviews documents (accessed via PAR)
4. Admin approves or rejects with notes
5. Designer role automatically granted on approval
6. Events emitted for downstream processing

### Product Publishing Workflow

1. Product created in draft status
2. Validation checks run automatically
3. Admin reviews validation issues
4. Admin publishes product when ready
5. Search index updated within 60s
6. Embeddings computed asynchronously

### Order Refund Processing

1. Admin navigates to order detail
2. Admin initiates full or partial refund
3. Refund request sent to Stripe
4. Webhook confirms refund processing
5. Order status updated
6. Customer notification sent

### Search Reindexing

1. Admin triggers reindex (full or scoped)
2. New index created with version increment
3. Backfill runs with progress tracking
4. Admin validates new index via query console
5. Admin swaps alias to new index
6. Old index retained for rollback period

## Deployment

### Production Build

```bash
# Build optimized production bundle
pnpm build

# Preview production build locally
pnpm start
```

### Environment Configuration

The application supports multiple environments:

- **Development**: Local development with hot reload
- **Staging**: Pre-production testing with staging backend
- **Production**: Production deployment on OCI

### OCI Deployment

The admin portal is deployed on OCI Container Engine for Kubernetes (OKE) with:

- **Ingress**: OCI Load Balancer with WAF
- **CDN**: OCI CDN for static assets
- **Secrets**: OCI Vault for sensitive configuration
- **Observability**: OCI Logging, APM, and Monitoring

### Health Checks

The application exposes health check endpoints:

- `/api/health`: Basic health check
- `/api/health/ready`: Readiness probe
- `/api/health/live`: Liveness probe

## Monitoring & Observability

### Telemetry

All requests are instrumented with OpenTelemetry and sent to OCI APM:

- Request tracing across services
- Performance metrics (latency, throughput)
- Error rates and exceptions
- User actions and audit events

### Dashboards

Built-in dashboards show:

- User activity metrics
- Designer verification SLAs
- Catalog quality metrics
- Order processing performance
- System health indicators
- API latency and error rates

### Alerts

Automated alerts for:

- SLO violations (p95 latency, error rate)
- Verification queue backlog
- Catalog validation issues
- Failed background jobs
- Security events (failed auth, suspicious activity)

## Contributing

### Code Style

- TypeScript strict mode enabled
- ESLint for linting
- Prettier for formatting (via ESLint)
- Conventional commits

### Testing Requirements

- Unit tests for all utilities and hooks
- Integration tests for key workflows
- E2E tests for critical admin paths
- 80%+ code coverage target

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with tests
3. Run `pnpm lint` and `pnpm type-check`
4. Run full test suite
5. Submit PR with description
6. Address code review feedback
7. Merge after approval

## Troubleshooting

### Common Issues

**Build Errors**

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**Authentication Issues**

- Verify OIDC configuration in `.env`
- Check Identity Domains client ID and secret
- Ensure redirect URI is registered
- Verify JWT validation in API Gateway

**API Connection Issues**

- Verify backend services are running
- Check service URLs in `.env`
- Verify network connectivity
- Check CORS configuration

**Performance Issues**

- Check React Query DevTools for excessive refetching
- Verify API response times in Network tab
- Check bundle size with `pnpm build`
- Enable React Strict Mode in development

## Support

For issues and questions:

- Check existing documentation in `/docs`
- Search GitHub issues
- Contact Platform team via Slack #admin-portal
- Email: platform@patina.com

## License

Proprietary - All rights reserved by Patina
