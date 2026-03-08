# Quick Start Guide - Patina Admin Portal

## Prerequisites

- Node.js 20+ installed
- pnpm 9+ installed
- Backend services running (user-management, catalog, media, orders, search)
- OCI Identity Domains configured

## Installation

```bash
# Navigate to admin portal directory
cd /home/middle/patina/apps/admin-portal

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## Environment Setup

Update `.env` with your values:

```bash
# Authentication
NEXT_PUBLIC_OIDC_ISSUER=https://idcs-xxx.identity.oraclecloud.com
NEXT_PUBLIC_OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret

# API Endpoints
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_USER_SERVICE_URL=http://localhost:3100
NEXT_PUBLIC_CATALOG_SERVICE_URL=http://localhost:3200
NEXT_PUBLIC_MEDIA_SERVICE_URL=http://localhost:3300
NEXT_PUBLIC_ORDERS_SERVICE_URL=http://localhost:3400
NEXT_PUBLIC_SEARCH_SERVICE_URL=http://localhost:3500

# Session
SESSION_SECRET=your-32-character-secret-key-here
```

## Development

```bash
# Start development server (runs on port 3001)
pnpm dev
```

Visit http://localhost:3001 in your browser.

## Available Routes

- `/dashboard` - Main dashboard with KPIs and overview
- `/users` - User management and role assignment
- `/verification` - Designer verification queue
- `/catalog` - Product catalog management
- `/media` - Media asset management
- `/orders` - Order management and refunds
- `/search` - Search configuration (synonyms, boosts, reindex)
- `/privacy` - Privacy operations (GDPR/CCPA)
- `/flags` - Feature flag management
- `/health` - System health monitoring
- `/analytics` - Analytics and reporting
- `/audit` - Audit log viewer
- `/settings` - Portal settings

## Common Tasks

### View Users
1. Navigate to `/users`
2. Use search bar to filter by email
3. Click user row for details

### Approve Designer
1. Navigate to `/verification`
2. Click "In Review" tab
3. Review documents
4. Click "Approve" or "Reject"

### Publish Product
1. Navigate to `/catalog`
2. Find product (use search/filters)
3. Click edit icon
4. Click "Publish" button

### Process Refund
1. Navigate to `/orders`
2. Find order
3. Click view icon
4. Click "Refund" button
5. Enter amount and reason

### Reindex Search
1. Navigate to `/search`
2. Scroll to "Index Management"
3. Click "Reindex" button
4. Monitor progress

## Troubleshooting

### Build Errors

```bash
# Clear cache and reinstall
rm -rf .next node_modules
pnpm install
```

### Type Errors

```bash
# Run type check
pnpm type-check
```

### Port Already in Use

```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port
pnpm dev -p 3002
```

### API Connection Issues

1. Verify backend services are running
2. Check service URLs in `.env`
3. Check network connectivity
4. Verify CORS settings on backend

## Development Tips

### Hot Reload
Changes to files automatically trigger hot reload. No need to restart server.

### React Query DevTools
Open browser console and click "React Query" button in bottom right to inspect queries and cache.

### Component Development
Components are in `src/components/ui/`. Reusable across all pages.

### Adding New Page
1. Create file in `src/app/(dashboard)/new-page/page.tsx`
2. Add route to `src/components/layout/admin-nav.tsx`
3. Add service methods in appropriate `src/services/*.ts` file
4. Add types to `src/types/index.ts` if needed

### API Integration Pattern

```typescript
// In service file (e.g., src/services/users.ts)
export const usersService = {
  async getUsers(params) {
    return apiClient.get('/v1/users', params);
  },
};

// In page component
const { data, isLoading } = useQuery({
  queryKey: ['users', params],
  queryFn: () => usersService.getUsers(params),
});
```

### Mutation Pattern

```typescript
const mutation = useMutation({
  mutationFn: (data) => usersService.updateUser(userId, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    toast.success('User updated');
  },
  onError: () => {
    toast.error('Failed to update user');
  },
});

// Trigger mutation
mutation.mutate({ displayName: 'New Name' });
```

## Testing

```bash
# Run tests (when implemented)
pnpm test

# Watch mode
pnpm test:watch

# E2E tests
pnpm test:e2e
```

## Production Build

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

## Code Quality

```bash
# Linting
pnpm lint

# Type checking
pnpm type-check

# All checks
pnpm lint && pnpm type-check
```

## Getting Help

- Check `README.md` for comprehensive documentation
- Check `IMPLEMENTATION_SUMMARY.md` for technical details
- Review PRD files in `/home/middle/patina/docs/features/`
- Contact Platform team via Slack #admin-portal

## Next Steps

After getting the portal running:

1. **Authentication**: Implement OIDC auth flow
2. **Permissions**: Add RBAC permission checks
3. **Forms**: Build edit/create forms for entities
4. **Details**: Create detail pages with full information
5. **Tests**: Add comprehensive test coverage

## Resource Links

- Next.js 15 Docs: https://nextjs.org/docs
- React Query: https://tanstack.com/query/latest
- Tailwind CSS: https://tailwindcss.com/docs
- Radix UI: https://www.radix-ui.com/

---

**Happy coding!** If you encounter issues, check the troubleshooting section or reach out to the team.
