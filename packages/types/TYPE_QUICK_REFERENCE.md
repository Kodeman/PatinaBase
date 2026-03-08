# @patina/types - Quick Reference Guide

## Installation & Usage

### Import Types
```typescript
import { User, Product, Order, Message } from '@patina/types';
```

### Commonly Used Types by Category

#### 🔐 Authentication
```typescript
import {
  LoginCredentials,    // { email, password }
  RegisterData,        // LoginCredentials + firstName, lastName, role
  AuthTokens,         // { accessToken, refreshToken, expiresIn }
  User,               // Full user profile
  UserRole            // 'admin' | 'designer' | 'manufacturer' | 'customer'
} from '@patina/types';
```

#### 🎨 Designer
```typescript
import {
  Designer,           // Designer profile with business info
} from '@patina/types';
```

#### 🌐 API & Common
```typescript
import {
  ApiRequestConfig,   // API client configuration
  ApiResponse,        // Standard API response wrapper
  ApiError,          // Error response structure
  PaginatedResponse, // Paginated data wrapper
  PaginationParams,  // Page, limit, sort params
  UUID,              // Type alias for string
  Timestamps,        // createdAt, updatedAt
  Status,            // 'active' | 'inactive' | 'pending' | 'archived'
  Address            // Street address structure
} from '@patina/types';
```

#### 🛍️ E-commerce
```typescript
import {
  Order,             // Full order with items
  OrderItem,         // Individual order line item
  OrderStatus,       // Order lifecycle status
  Product,           // Product catalog item
  Variant,           // Product variant (SKU level)
  ProductImage,      // Product image with metadata
  Collection,        // Product collection (manual or dynamic)
  Category          // Product category
} from '@patina/types';
```

#### 💅 Style & Preferences
```typescript
import {
  StyleProfile,      // User style preferences
  StylePreference,   // Style categories
  ColorPreference,   // Color preferences with hex
  BudgetRange       // Min/max budget
} from '@patina/types';
```

#### 📋 Proposals
```typescript
import {
  Proposal,          // Design proposal
  ProposalSection,   // Proposal section
  ProposalItem,      // Item in proposal
  ProposalStatus,    // Proposal lifecycle status
  ProposalWithDetails // Proposal with nested data
} from '@patina/types';
```

#### 🏗️ Projects
```typescript
import {
  Project,           // Project entity
  Task,              // Project task
  Milestone,         // Project milestone
  RFI,              // Request for Information
  Issue,            // Project issue
  ChangeOrder,      // Change order
  DailyLog,         // Daily log entry
  ProjectDocument,  // Project document
  ProjectStatus,    // 'draft' | 'active' | 'substantial_completion' | 'closed'
  TaskStatus,       // Task lifecycle status
  ProjectWithDetails // Project with nested entities
} from '@patina/types';
```

#### 💬 Communications
```typescript
import {
  Message,          // Chat message
  Thread,           // Message thread
  Notification,     // User notification
  NotificationPreference, // Notification settings
  MessageStatus,    // 'sent' | 'delivered' | 'read'
  NotificationChannel // 'ios' | 'android' | 'web' | 'email' | 'sms'
} from '@patina/types';
```

## Type File Locations

| Type | File Path |
|------|-----------|
| Authentication | `/home/middle/patina/packages/types/src/user.ts` |
| Designer | `/home/middle/patina/packages/types/src/designer.ts` |
| API/Common | `/home/middle/patina/packages/types/src/api.ts` & `common.ts` |
| Products | `/home/middle/patina/packages/types/src/product.ts` |
| Catalog | `/home/middle/patina/packages/types/src/catalog.ts` |
| Orders | `/home/middle/patina/packages/types/src/order.ts` |
| Style | `/home/middle/patina/packages/types/src/style-profile.ts` |
| Proposals | `/home/middle/patina/packages/types/src/proposal.ts` |
| Projects | `/home/middle/patina/packages/types/src/project.ts` |
| Communications | `/home/middle/patina/packages/types/src/comms.ts` |
| Events | `/home/middle/patina/packages/types/src/events.ts` |
| ML/Aesthete | `/home/middle/patina/packages/types/src/aesthete.ts` |

## Common Patterns

### Paginated API Response
```typescript
import { PaginatedResponse, User, PaginationParams } from '@patina/types';

// Request params
const params: PaginationParams = {
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc'
};

// Response
const response: PaginatedResponse<User> = {
  data: [],
  meta: {
    total: 100,
    page: 1,
    limit: 20,
    totalPages: 5
  }
};
```

### API Error Handling
```typescript
import { ApiResponse, ApiError } from '@patina/types';

const response: ApiResponse<User> = {
  success: false,
  error: {
    code: 'AUTH_ERROR',
    message: 'Invalid credentials',
    timestamp: new Date().toISOString()
  }
};
```

### Entity with Timestamps
```typescript
import { Timestamps, UUID } from '@patina/types';

interface MyEntity extends Timestamps {
  id: UUID;
  name: string;
  // createdAt and updatedAt inherited from Timestamps
}
```

## Development Commands

```bash
# Build types package
pnpm --filter @patina/types build

# Watch for changes
pnpm --filter @patina/types dev

# Type check
pnpm --filter @patina/types type-check

# Clean build artifacts
pnpm --filter @patina/types clean
```

## Adding New Types

1. **Create or edit source file** in `packages/types/src/`
2. **Add to index.ts** if new file: `export * from './my-new-types';`
3. **Build the package**: `pnpm --filter @patina/types build`
4. **Dependent packages auto-update** via workspace protocol

## Troubleshooting

### "Cannot find module '@patina/types'"
```bash
# Rebuild the types package
pnpm --filter @patina/types build

# Rebuild dependent packages
pnpm --filter @patina/api-client build
```

### Types not updating in IDE
```bash
# Restart TypeScript server in VS Code
# Cmd/Ctrl + Shift + P > "TypeScript: Restart TS Server"

# Or rebuild
pnpm --filter @patina/types build
```

### Build errors in dependent packages
```bash
# Clean and rebuild all
pnpm clean
pnpm install
pnpm build
```

## Best Practices

1. **Always import from @patina/types** - Never redefine types locally
2. **Use type imports** - `import type { User }` for type-only imports
3. **Extend base types** - Reuse `Timestamps`, `UUID`, etc.
4. **Keep types domain-focused** - One file per domain area
5. **Document complex types** - Add JSDoc comments for clarity

## Related Packages

- `@patina/api-client` - Uses types for API calls
- `@patina/testing` - Uses types for mocks and fixtures
- Frontend apps - Use types for components and pages
- Backend services - Use types for DTOs and validation
