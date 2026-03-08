# Designer Portal - Quick Start Guide

Get the Designer Portal up and running in 5 minutes.

## Prerequisites

- Node.js 18+ and pnpm
- OCI Identity Domains tenant (or configure another OIDC provider)
- Backend services running (or use mock data)

## Step 1: Install Dependencies

```bash
# From monorepo root
cd /home/middle/patina
pnpm install
```

## Step 2: Configure Environment

```bash
# Navigate to designer portal
cd apps/designer-portal

# Copy environment template
cp .env.example .env.local

# Generate NextAuth secret
openssl rand -base64 32
```

Edit `.env.local` and set required variables:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generated-secret>

# OCI Identity Domains
NEXT_PUBLIC_OIDC_ISSUER=https://your-domain.identity.oraclecloud.com
NEXT_PUBLIC_OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

## Step 3: Configure OCI Identity Domains

1. **Create OAuth Application**:
   - Go to OCI Console → Identity & Security → Domains
   - Select your domain
   - Navigate to Applications → Add application
   - Choose "Confidential Application"

2. **Configure OAuth Settings**:
   - **Client Type**: Confidential
   - **Grant Types**:
     - ✅ Authorization Code
     - ✅ Refresh Token
   - **Redirect URI**: `http://localhost:3000/api/auth/callback/oci-identity-domains`
   - **Scopes**: `openid`, `profile`, `email`, `offline_access`

3. **Add Custom Claims** (Optional):
   - Go to Application → Token claims
   - Add `roles` claim to ID token
   - Map to user groups

4. **Copy Credentials**:
   - Copy Client ID → `NEXT_PUBLIC_OIDC_CLIENT_ID`
   - Copy Client Secret → `OIDC_CLIENT_SECRET`
   - Copy Issuer URL → `NEXT_PUBLIC_OIDC_ISSUER`

## Step 4: Start Development Server

```bash
# From apps/designer-portal
pnpm dev
```

The application will start at `http://localhost:3000`

## Step 5: Test Authentication

1. Navigate to `http://localhost:3000`
2. Click "Sign In"
3. You'll be redirected to OCI Identity Domains
4. Enter your credentials
5. After successful auth, you'll be redirected to `/dashboard`

## Authentication Flow

```
User → Sign In Page → OCI Identity Domains → Callback → Dashboard
```

## Available Routes

### Public Routes
- `/` - Landing page
- `/auth/signin` - Sign in page
- `/auth/signout` - Sign out page
- `/auth/error` - Authentication errors

### Protected Routes (Designer)
- `/dashboard` - Main dashboard
- `/clients` - Client management
- `/catalog` - Product catalog
- `/proposals` - Proposal management
- `/projects` - Project tracking
- `/messages` - Messaging
- `/teaching` - Teaching interface
- `/settings` - User settings

## User Roles

The portal supports three roles:

1. **Designer** (default)
   - Full access to all design features
   - Client management
   - Proposal creation
   - Teaching interface

2. **Admin**
   - All designer permissions
   - User management
   - Analytics access

3. **Client**
   - View proposals
   - View projects
   - Limited access

## Testing with Mock Data

If backend services aren't running, the portal uses mock data for:
- Client list
- Proposals
- Products (limited)

To enable real API integration:
1. Ensure all backend services are running
2. Update API URLs in `.env.local`
3. Restart the dev server

## Common Tasks

### Update User Profile

```tsx
import { useAuth } from '@/hooks/use-auth';

function MyComponent() {
  const { user } = useAuth();

  // Access user data
  console.log(user.name, user.email, user.roles);
}
```

### Check Permissions

```tsx
import { usePermissions } from '@/hooks/use-auth';
import { Permission } from '@/lib/rbac';

function MyComponent() {
  const { checkPermission } = usePermissions();

  const canCreateClient = checkPermission(Permission.CREATE_CLIENT);

  return canCreateClient ? <CreateButton /> : null;
}
```

### Protect Routes

```tsx
import { useRequireAuth } from '@/hooks/use-auth';
import { Role } from '@/lib/rbac';

function ProtectedPage() {
  useRequireAuth({ requiredRole: Role.DESIGNER });

  return <div>Protected Content</div>;
}
```

### Sign Out Programmatically

```tsx
import { useAuth } from '@/hooks/use-auth';

function MyComponent() {
  const { signOut } = useAuth();

  return <button onClick={signOut}>Sign Out</button>;
}
```

## Troubleshooting

### Issue: "Invalid configuration" error

**Solution**: Verify all required environment variables are set

```bash
# Check .env.local has:
NEXTAUTH_SECRET=<value>
NEXT_PUBLIC_OIDC_ISSUER=<value>
NEXT_PUBLIC_OIDC_CLIENT_ID=<value>
OIDC_CLIENT_SECRET=<value>
```

### Issue: Redirect loop on sign in

**Solution**: Check OCI redirect URI matches exactly

```
Expected: http://localhost:3000/api/auth/callback/oci-identity-domains
Actual: (check OCI console)
```

### Issue: "Session expired" immediately

**Solution**: Ensure `offline_access` scope is included

```env
NEXT_PUBLIC_OIDC_SCOPE=openid profile email offline_access
```

### Issue: 401 errors on API requests

**Solution**: Check API client is using session token

```tsx
import { catalogApi } from '@/lib/api-client';

// Token automatically injected
const products = await catalogApi.getProducts();
```

## Next Steps

1. **Read Full Documentation**:
   - [Authentication Guide](./AUTHENTICATION.md)
   - [Deployment Guide](./DEPLOYMENT.md)

2. **Explore Features**:
   - Client management
   - Proposal builder
   - Product catalog
   - Style profiles

3. **Customize**:
   - Update branding
   - Configure permissions
   - Add custom components

4. **Deploy**:
   - Build for production
   - Deploy to Vercel/Railway/etc.

## Development Scripts

```bash
# Start dev server
pnpm dev

# Type check
pnpm type-check

# Lint
pnpm lint
pnpm lint:fix

# Build
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test
pnpm test:watch
pnpm test:coverage
```

## Support

- **Documentation**: Check `/docs` folder
- **Issues**: Create GitHub issue
- **Questions**: Contact team lead

---

**Ready to Build!** 🚀

Your Designer Portal is now configured and ready for development.
