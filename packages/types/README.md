# @patina/types

Shared TypeScript type definitions for the Patina monorepo. This package is the single source of truth for all domain types across frontend and backend services.

## Installation

```bash
pnpm add @patina/types
```

## Usage

```typescript
import { Product, User, Order, PaginatedResponse } from '@patina/types';

// Use in your service
async function getProducts(): Promise<PaginatedResponse<Product>> {
  // ...
}

// Type-safe product creation
const product: Product = {
  id: '123',
  slug: 'premium-sofa',
  name: 'Premium Leather Sofa',
  brand: 'Luxury Furniture Co.',
  status: 'published',
  // ...
};
```

## Exported Types

### Common Types (`common.ts`)

Core types used across all domains:

- **`UUID`** - UUID string type (branded for type safety)
- **`Timestamps`** - Standard `createdAt` and `updatedAt` fields
- **`PaginationParams`** - Query parameters for paginated requests
  - `page: number` - Page number (1-indexed)
  - `limit: number` - Items per page
  - `sortBy?: string` - Field to sort by
  - `sortOrder?: 'asc' | 'desc'` - Sort direction
- **`PaginatedResponse<T>`** - Standardized paginated response format
  - `data: T[]` - Array of items
  - `meta.total` - Total count of items
  - `meta.page` - Current page
  - `meta.limit` - Items per page
  - `meta.totalPages` - Total pages
- **`Status`** - Generic status enum: `'active' | 'inactive' | 'pending' | 'archived'`
- **`Address`** - Physical address structure

### Product Domain (`product.ts`)

Types for product catalog:

- **`Product`** - Base product entity
  - Core fields: `id`, `slug`, `name`, `brand`, `description`
  - Pricing: `price`, `compareAtPrice`, `currency`
  - Categorization: `categoryId`, `tags`, `collections`
  - Physical: `dimensions`, `materials`, `weight`
  - Media: `images`, `videos`, `has3D`, `arSupported`
  - Status: `status`, `published`, `publishedAt`
  - Inventory: `sku`, `trackInventory`, `inventoryQuantity`

- **`Variant`** - Product variant/SKU
  - Variation: `options` (e.g., color, size, material)
  - Individual pricing and inventory tracking
  - Option combinations (e.g., "Blue / Large / Leather")

- **`ProductImage`** - Product image metadata
  - Image URL, alt text, display order
  - Perceptual hash (`phash`) for duplicate detection
  - Color extraction data

- **`CustomizationOption`** - Product customization
  - Option types: dimension, material, color, engraving
  - Pricing impact and constraints

- **`Embedding`** - Semantic similarity vectors (pgvector)
  - Used for visual and text-based product search

### Catalog Domain (`catalog.ts`)

Types for catalog organization:

- **`Category`** - Hierarchical product category
  - Tree structure with `parentId`
  - SEO fields, display order

- **`Collection`** - Product groupings
  - **Manual collections**: Curated product lists
  - **Rule-based collections**: Dynamic queries
  - Featured products, custom ordering

- **`Vendor`** - Manufacturer/supplier information
  - Contact details, terms, lead times
  - Product catalog integration

- **`VendorProduct`** - Vendor SKU mappings
  - Links internal products to vendor SKUs
  - Pricing, availability, lead time

### User Domain (`user.ts`)

User account and role types:

- **`User`** - Base user entity
  - Authentication: email, password hash
  - Profile: name, phone, avatar
  - Status: active, verified, role

- **`UserRole`** - Role enum
  - `'client'` - End customer
  - `'designer'` - Interior designer
  - `'admin'` - Platform administrator
  - `'manufacturer'` - Vendor user

- **`Designer`** - Designer profile extension
  - Bio, specialties, portfolio
  - Certifications, years of experience
  - Verification status

- **`Client`** - Client profile extension
  - Preferences, style profile reference

### Project Domain (`project.ts`)

Project management types:

- **`Project`** - Design project
  - Client and designer assignments
  - Budget, timeline, status
  - Room specifications

- **`Task`** - Project task/todo
  - Assignee, due date, priority
  - Status tracking, dependencies

- **`RFI`** - Request for Information
  - Questions and responses
  - Attachment support

- **`Milestone`** - Project milestone
  - Target dates, dependencies
  - Completion tracking

- **`ChangeOrder`** - Scope changes
  - Budget and timeline impacts
  - Approval workflow

### Order Domain (`order.ts`)

E-commerce and fulfillment types:

- **`Order`** - Customer order
  - Line items, totals, discounts
  - Shipping and billing addresses
  - Payment and fulfillment status

- **`OrderItem`** - Individual line item
  - Product reference, quantity, price
  - Snapshot of product at order time

- **`Cart`** - Shopping cart
  - Temporary item storage
  - Auto-expiration

- **`Payment`** - Payment transaction
  - Payment method, amount, status
  - Stripe integration fields

- **`Shipment`** - Fulfillment tracking
  - Carrier, tracking number
  - Delivery estimates

### Style Profile Domain (`style-profile.ts`)

User preference and taste analysis:

- **`StyleProfile`** - User style preferences
  - Style quiz responses
  - Color preferences, budget band
  - Room-specific preferences

- **`StyleSignal`** - Implicit preference signals
  - Product views, likes, saves
  - Used for ML recommendations

### Media Types (`media.ts`)

Digital asset management:

- **`MediaAsset`** - Media file metadata
  - Type: image, video, 3D model, document
  - Storage: URL, S3 key, CDN URL
  - Processing: thumbnails, variants
  - Perceptual hash for deduplication

- **`MediaAssetType`** - Type enum: `'image' | 'video' | '3d_model' | 'document'`

- **`MediaAssetStatus`** - Processing status
  - `'pending'` - Uploaded, awaiting processing
  - `'processing'` - Active processing
  - `'ready'` - Available for use
  - `'failed'` - Processing error

- **`MediaLibraryAsset`** - Extended media with usage tracking

- **`ImageEditorState`** - Image editing state (crop, filters, etc.)

### Communications (`comms.ts`)

Messaging and notifications:

- **`Thread`** - Message thread/conversation
  - Participants, subject, status
  - Last message timestamp

- **`Message`** - Individual message
  - Author, text content, attachments
  - Read status, reactions

- **`Notification`** - System notification
  - Type, channel, priority
  - Delivery status

### Proposal Types (`proposal.ts`)

Design proposal and presentation:

- **`Proposal`** - Complete design proposal
  - Sections, items, pricing
  - Version control, approval workflow

- **`ProposalSection`** - Proposal chapter/room
  - Grouped items, descriptions

- **`ProposalItem`** - Individual proposal item
  - Product reference or custom item
  - Quantity, pricing, notes

### Search Types (`catalog-search.ts`)

Product search and filtering:

- **`SearchFilters`** - Search filter criteria
  - Price range, categories, materials
  - Dimensions, colors, brands

- **`SearchResults<T>`** - Search response format
  - Results, facets, aggregations
  - Query metadata

### Event Types (`events.ts`)

Event-driven architecture types:

- **`OutboxEvent`** - Transactional outbox event
  - Event type, payload, status
  - Retry tracking

- Event type patterns: `<service>.<entity>.<action>`
  - Examples: `catalog.product.published`, `orders.order.placed`

### API Types (`api.ts`)

HTTP API contract types:

- **`ApiResponse<T>`** - Standard API response wrapper
- **`ApiError`** - Error response format
  - Error code, message, details
  - Request ID for tracing

### ML/AI Types (`aesthete.ts`)

Machine learning service types:

- **`Recommendation`** - Product recommendation
  - Score, reasoning, context
- **`EmbeddingVector`** - Vector representation
- **`FeedbackEvent`** - User feedback for training

## Type Safety Best Practices

### 1. Never Redefine Types

Always import from this package rather than creating duplicate definitions:

```typescript
// ❌ Bad - duplicate type definition
interface Product {
  id: string;
  name: string;
}

// ✅ Good - import from @patina/types
import { Product } from '@patina/types';
```

### 2. Use Branded Types for IDs

UUID types are branded to prevent mixing different entity IDs:

```typescript
import { UUID } from '@patina/types';

// Type-safe - prevents mixing product and user IDs
function getProduct(productId: UUID): Product { ... }
function getUser(userId: UUID): User { ... }
```

### 3. Validate at Runtime

TypeScript types are compile-time only. Always validate user input:

```typescript
import { Product } from '@patina/types';
import { z } from 'zod';

// Define runtime schema
const ProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  // ...
});

// Validate and parse
const product = ProductSchema.parse(userInput);
```

### 4. Keep DTOs Separate

These are domain types, not API DTOs. Create separate DTO types for API contracts:

```typescript
// Domain type (from @patina/types)
import { Product } from '@patina/types';

// API DTO (in your service)
export class CreateProductDto {
  name: string;
  price: number;
  categoryId: string;
  // Subset of Product fields needed for creation
}
```

### 5. Use Utility Types

Leverage TypeScript utility types for transformations:

```typescript
import { Product } from '@patina/types';

// Partial for updates
type ProductUpdate = Partial<Product>;

// Pick for specific fields
type ProductSummary = Pick<Product, 'id' | 'name' | 'price'>;

// Omit for exclusions
type ProductWithoutTimestamps = Omit<Product, 'createdAt' | 'updatedAt'>;
```

## Development

This package contains only type definitions (no runtime code), so there's no build step required:

```bash
cd packages/types

# Type checking
pnpm type-check

# Run tests (validates type definitions)
pnpm test

# Lint
pnpm lint
```

## Adding New Types

When adding new types to this package:

1. **Add to appropriate domain file** (e.g., `product.ts`, `user.ts`)
   - Create new file if starting a new domain

2. **Export from `index.ts`**
   ```typescript
   export * from './my-new-domain';
   ```

3. **Add JSDoc comments** for IDE autocomplete
   ```typescript
   /**
    * Represents a design mood board
    */
   export interface MoodBoard {
     id: UUID;
     title: string;
     images: MediaAsset[];
   }
   ```

4. **Add validation tests** in `__tests__/`
   - Test type compatibility
   - Test utility type transformations

5. **Update this README** with the new types

6. **Version appropriately**
   - Patch: Documentation, comments
   - Minor: New types, optional fields
   - Major: Breaking changes to existing types

## TypeScript Configuration

This package uses strict TypeScript settings:

- `strict: true` - All strict checks enabled
- `noImplicitAny: true` - No implicit any types
- `strictNullChecks: true` - Null safety
- `esModuleInterop: true` - ES module compatibility

## Contributing

Before submitting changes:

1. Run type checking: `pnpm type-check`
2. Ensure all tests pass: `pnpm test`
3. Update documentation in this README
4. Follow existing naming conventions
5. Add JSDoc comments to all exported types

## License

Proprietary - Patina Platform
