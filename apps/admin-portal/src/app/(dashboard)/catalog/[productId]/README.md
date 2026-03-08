# Product Edit Page

Full-featured product editor with tabbed interface for the admin portal.

## Quick Links

- [Full Documentation](../../../../PRODUCT_EDIT_PAGE_DOCUMENTATION.md)
- [Quick Start Guide](../../../../PRODUCT_EDIT_PAGE_QUICK_START.md)
- [Type Definitions](../../../types/admin-catalog.ts)
- [Hooks Documentation](../../../hooks/use-admin-products.ts)

## File Structure

```
catalog/[productId]/
├── page.tsx              # Main product edit page component
└── README.md            # This file
```

## Features at a Glance

- **Tabs**: Details, Variants, Media, SEO
- **Validation**: react-hook-form + zod schemas
- **State**: TanStack Query for server state
- **UI**: Radix UI + Tailwind CSS + Shadcn components
- **Notifications**: Toast system for feedback
- **Navigation**: Unsaved changes warning
- **Actions**: Save, Publish/Unpublish, Delete

## Usage

### Navigate to Product Edit Page

```typescript
// From catalog list
import Link from 'next/link';

<Link href={`/catalog/${product.id}`}>
  Edit Product
</Link>
```

### Direct URL

```
/catalog/[productId]
```

Example: `/catalog/550e8400-e29b-41d4-a716-446655440000`

## Component Architecture

```
ProductEditPage
├── Header (Sticky)
│   ├── Back Button
│   ├── Title & Status
│   └── Actions (Publish, Delete, Save)
├── Tabs Container
│   ├── Details Tab (Basic info, pricing)
│   ├── Variants Tab (SKU management)
│   ├── Media Tab (Images, videos, 3D)
│   └── SEO Tab (Meta tags, slug)
└── Delete Dialog (Confirmation)
```

## Data Flow

1. **Mount**: `useProduct(productId)` fetches data
2. **Load**: Forms populated via `form.reset()`
3. **Edit**: User changes tracked via form watch
4. **Save**: Validation → Mutation → Toast → Refetch
5. **Navigate**: Unsaved changes warning if dirty

## Key Dependencies

- `react-hook-form` - Form state management
- `zod` - Schema validation
- `@tanstack/react-query` - Server state
- `@radix-ui/*` - Accessible UI primitives
- `lucide-react` - Icons
- `@patina/types` - Shared types

## Customization Examples

### Add a New Field

```typescript
// 1. Update schema
const productDetailsSchema = z.object({
  // ...existing fields
  customField: z.string().optional(),
});

// 2. Add to form
<Input {...register('customField')} />

// 3. Save with other data
```

### Add a New Tab

```typescript
<TabsContent value="custom">
  <CustomTab productId={params.productId} />
</TabsContent>
```

### Custom Validation

```typescript
const schema = z.object({
  price: z.number().min(0),
}).refine(
  (data) => data.price > 0,
  { message: 'Price required', path: ['price'] }
);
```

## Testing

```bash
# Unit tests
pnpm test page.test.tsx

# E2E tests
pnpm test:e2e catalog/product-edit.spec.ts
```

## Common Issues

### Product not loading
- Verify productId in URL
- Check network tab for API errors
- Ensure user has permissions

### Form not saving
- Check validation errors in console
- Verify required fields filled
- Check network for mutation errors

### Unsaved changes not working
- Verify form watch subscriptions
- Check if defaultValues match loaded data

## Development

```bash
# Start dev server
pnpm dev

# Type check
pnpm type-check

# Lint
pnpm lint

# Build
pnpm build
```

## Related Components

- [Catalog List Page](../page.tsx)
- [Product Card](../../../components/catalog/admin-product-card.tsx)
- [Bulk Actions](../../../components/catalog/bulk-action-toolbar.tsx)

## Contributing

When modifying:
1. Maintain TypeScript types
2. Update documentation
3. Add tests for new features
4. Follow existing patterns
5. Ensure accessibility

## Support

For questions or issues:
1. Check [Full Documentation](../../../../PRODUCT_EDIT_PAGE_DOCUMENTATION.md)
2. Review [Type Definitions](../../../types/)
3. Check [hooks implementation](../../../hooks/)
