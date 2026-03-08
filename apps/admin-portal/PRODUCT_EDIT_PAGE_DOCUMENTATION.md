# Product Edit Page Documentation

## Overview

The Product Edit Page is a comprehensive full-page editor for managing products in the admin portal. It provides a tabbed interface with form validation, optimistic updates, auto-save capabilities, and robust error handling.

**Location**: `/apps/admin-portal/src/app/(dashboard)/catalog/[productId]/page.tsx`

## Features

### 1. Tabbed Interface

Four main tabs for different aspects of product management:

- **Details Tab**: Basic product information
  - Product name, brand, descriptions
  - Pricing (price, MSRP, sale price)
  - Product status

- **Variants Tab**: Product variant management
  - SKU, pricing, inventory levels
  - Variant attributes (color, size, material)
  - Inline editing capabilities

- **Media Tab**: Image and media gallery
  - Upload images, videos, 3D models
  - Reorder media files
  - Set primary image
  - Delete media assets

- **SEO Tab**: Search engine optimization
  - URL slug management
  - Meta title and description
  - SEO preview
  - Character count indicators

### 2. Data Fetching & Mutations

Uses TanStack Query hooks from `@/hooks/use-admin-products`:

```typescript
// Query hooks
useProduct(productId)           // Fetch single product
useUpdateProduct()              // Update product mutation
useDeleteProduct()              // Delete product mutation
usePublishProduct()             // Publish product mutation
useUnpublishProduct()           // Unpublish product mutation
```

**Query Configuration:**
- Stale time: 10 minutes for product details
- Automatic refetching on window focus
- Cache invalidation on mutations
- Optimistic updates for better UX

### 3. Form Validation

Uses `react-hook-form` + `zod` for robust validation:

**Details Schema:**
```typescript
- name: 1-200 characters (required)
- brand: 1-100 characters (required)
- shortDescription: 10-500 characters (required)
- longDescription: optional
- price: positive number (required)
- msrp: positive number (optional)
- salePrice: positive number (optional)
- status: enum ['draft', 'in_review', 'published', 'deprecated']
```

**SEO Schema:**
```typescript
- slug: lowercase alphanumeric with hyphens (required)
- seoTitle: max 60 characters (optional)
- seoDescription: max 160 characters (optional)
- seoKeywords: array of strings (optional)
```

### 4. Unsaved Changes Detection

**Implementation:**
- Watches all form fields for changes
- Sets `hasUnsavedChanges` flag when data is modified
- Shows visual indicator in header
- Prevents navigation with browser warning
- Clears flag after successful save

**User Experience:**
- Orange "Unsaved changes" indicator
- Browser confirmation dialog on navigation/close
- Save button disabled when no changes

### 5. Auto-Save (Ready for Implementation)

Architecture supports auto-save with:
- `isAutoSaving` state flag
- `lastSaved` timestamp
- Debouncing mechanism (ready to implement)

**To enable auto-save:**
```typescript
// Add to the component
const debouncedSave = useMemo(
  () => debounce(handleSave, 3000),
  [handleSave]
);

useEffect(() => {
  if (hasUnsavedChanges) {
    debouncedSave();
  }
}, [detailsForm.watch(), seoForm.watch()]);
```

### 6. Loading States

**Product Loading:**
- Full-page skeleton with header and content placeholders
- Smooth transitions when data loads

**Mutation Loading:**
- Button loading states with spinner
- Disabled buttons during operations
- Loading text feedback

**Error States:**
- Product not found screen
- Error message display
- Back to catalog navigation

### 7. Toast Notifications

Success and error feedback using Radix UI Toast:

```typescript
// Success
toast({
  title: 'Product saved',
  description: 'Your changes have been saved successfully.',
});

// Error
toast({
  title: 'Save failed',
  description: error.message,
  variant: 'destructive',
});
```

### 8. Sticky Header

Always-visible header with:
- Back button to catalog
- Product name and brand
- Save status indicators
- Action buttons (Publish/Unpublish, Delete, Save)

### 9. Delete Confirmation

Modal dialog for destructive actions:
- Confirmation required
- Shows product name
- Cancel/Delete buttons
- Loading state during deletion
- Navigation to catalog after deletion

## Architecture Patterns

### Component Structure

```
ProductEditPage (Main Component)
├── Sticky Header
│   ├── Back Button
│   ├── Title & Status
│   └── Action Buttons
├── Tabs Container
│   ├── DetailsTab
│   ├── VariantsTab
│   ├── MediaTab
│   └── SeoTab
└── Delete Dialog
```

### State Management

**Local State:**
- `activeTab`: Current tab selection
- `hasUnsavedChanges`: Unsaved changes flag
- `showDeleteDialog`: Delete modal visibility
- `isAutoSaving`: Auto-save in progress
- `lastSaved`: Last save timestamp

**Form State (react-hook-form):**
- `detailsForm`: Details tab form
- `seoForm`: SEO tab form

**Server State (TanStack Query):**
- Product data from `useProduct`
- Mutation states from mutation hooks

### Data Flow

1. **Load**: Component mounts → `useProduct` fetches data
2. **Populate**: Data arrives → Forms populated via `reset()`
3. **Edit**: User changes form → `hasUnsavedChanges = true`
4. **Save**: Save button clicked → Validation → Mutation → Toast
5. **Success**: Query invalidated → Fresh data → Flag cleared

### Error Handling

**Loading Errors:**
- Product not found → Error screen with back button
- Network error → Error message in toast

**Validation Errors:**
- Client-side validation → Inline error messages
- Form submission blocked until valid

**Mutation Errors:**
- Caught in try/catch blocks
- Toast notification with error message
- Original data preserved

## TypeScript Types

All types are properly typed from shared packages:

```typescript
import type { Product, ProductStatus } from '@patina/types';

// Form data types from zod schemas
type ProductDetailsFormData = z.infer<typeof productDetailsSchema>;
type ProductSeoFormData = z.infer<typeof productSeoSchema>;
```

## Styling

Uses Tailwind CSS utility classes with:
- Responsive design (mobile-first)
- Consistent spacing scale
- Semantic color tokens
- Focus states for accessibility

## Accessibility

**ARIA Labels:**
- Form labels properly associated with inputs
- Button roles and labels

**Keyboard Navigation:**
- Tab key navigation
- Enter to submit forms
- Escape to close modals

**Screen Reader Support:**
- Semantic HTML structure
- Error messages announced
- Loading states announced

## Performance Optimizations

1. **Memoization**: Callbacks wrapped with `useCallback`
2. **Debouncing**: Auto-save uses debounce (when enabled)
3. **Query Caching**: TanStack Query caches product data
4. **Lazy Loading**: Tabs content rendered on demand
5. **Optimistic Updates**: UI updates before server confirmation

## Testing Recommendations

### Unit Tests
```typescript
// Test form validation
test('should validate required fields')
test('should show error for invalid slug format')
test('should enforce character limits')

// Test mutations
test('should update product on save')
test('should show success toast on save')
test('should handle save errors')

// Test navigation
test('should warn on unsaved changes')
test('should navigate back to catalog')
```

### Integration Tests
```typescript
// Test complete workflows
test('should load product and populate forms')
test('should save changes and refetch data')
test('should publish/unpublish product')
test('should delete product with confirmation')
```

### E2E Tests (Playwright)
```typescript
// Test user journeys
test('admin can edit product details')
test('admin can upload product images')
test('admin sees unsaved changes warning')
test('admin can delete product')
```

## Future Enhancements

### Priority 1 (High Value)
- [ ] Auto-save implementation with debouncing
- [ ] Image upload with drag-and-drop
- [ ] Rich text editor for long description
- [ ] Variant inline editing
- [ ] Bulk media operations

### Priority 2 (Medium Value)
- [ ] Version history and rollback
- [ ] Product duplication
- [ ] Template system for common products
- [ ] AI-powered SEO suggestions
- [ ] Inventory tracking integration

### Priority 3 (Nice to Have)
- [ ] Collaborative editing (real-time)
- [ ] Comments and review workflow
- [ ] Advanced media editing (crop, filters)
- [ ] A/B testing for product descriptions
- [ ] Analytics integration (views, conversions)

## API Endpoints Used

### Read Operations
- `GET /api/catalog/products/:productId` - Fetch product details

### Write Operations
- `PATCH /api/catalog/products/:productId` - Update product
- `DELETE /api/catalog/products/:productId` - Delete product
- `POST /api/catalog/products/:productId/publish` - Publish product
- `POST /api/catalog/products/:productId/unpublish` - Unpublish product

### Media Operations (Future)
- `POST /api/catalog/products/:productId/media` - Upload media
- `PATCH /api/catalog/products/:productId/media/:mediaId` - Update media
- `DELETE /api/catalog/products/:productId/media/:mediaId` - Delete media

## Dependencies

### Core Dependencies
- `react` ^19.0.0 - UI framework
- `next` ^15.0.0 - App Router framework
- `react-hook-form` ^7.x - Form state management
- `@hookform/resolvers` ^3.x - Form validation resolvers
- `zod` ^3.x - Schema validation
- `@tanstack/react-query` ^5.x - Server state management

### UI Dependencies
- `@radix-ui/react-toast` - Toast notifications
- `@radix-ui/react-dialog` - Modal dialogs
- `@radix-ui/react-label` - Form labels
- `lucide-react` - Icon components
- `class-variance-authority` - Component variants
- `tailwindcss` ^3.x - Styling

### Internal Dependencies
- `@patina/types` - Shared TypeScript types
- `@/hooks/use-admin-products` - Custom React hooks
- `@/components/ui/*` - UI component library
- `@/services/catalog` - Catalog API service

## Environment Variables

No specific environment variables required. Uses inherited config from:
- Next.js app configuration
- TanStack Query configuration
- API client base URL

## Known Issues & Limitations

1. **Variants Tab**: Currently read-only, inline editing not implemented
2. **Media Tab**: Upload functionality placeholder only
3. **Auto-Save**: Architecture ready but not enabled by default
4. **Rich Text**: Long description uses plain textarea
5. **Concurrent Editing**: No conflict resolution for simultaneous edits

## Troubleshooting

### Product Not Loading
- Check network tab for API errors
- Verify productId parameter in URL
- Check authentication token validity

### Form Not Saving
- Check browser console for validation errors
- Verify all required fields are filled
- Check network for mutation errors

### Unsaved Changes Not Detecting
- Verify form watch subscriptions
- Check if default values match loaded data
- Clear browser cache and reload

## Contributing

When modifying this component:

1. **Maintain type safety** - All props and state properly typed
2. **Follow patterns** - Use existing hooks and patterns
3. **Add tests** - Cover new functionality
4. **Update docs** - Keep this file current
5. **Accessibility** - Maintain WCAG 2.1 AA compliance

## Related Documentation

- [Admin Catalog Architecture](./ADMIN_PORTAL_CATALOG_ARCHITECTURE.md)
- [TanStack Query Hooks](./src/hooks/use-admin-products.ts)
- [Type System](./src/types/TYPE_ARCHITECTURE.md)
- [UI Components](./src/components/ui/README.md)
