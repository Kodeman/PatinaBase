# ProductCreateDialog Usage Guide

## Overview

The `ProductCreateDialog` component provides a comprehensive form for creating new products in the admin portal catalog. It includes validation, error handling, and automatic list refresh on success.

## Basic Usage

```tsx
import { useState } from 'react';
import { ProductCreateDialog } from '@/components/catalog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function CatalogPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div>
      <Button onClick={() => setIsCreateDialogOpen(true)}>
        <Plus className="h-4 w-4" />
        Create Product
      </Button>

      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={(productId) => {
          console.log('Product created:', productId);
          // Optional: Navigate to product detail page
          // router.push(`/catalog/products/${productId}`);
        }}
      />
    </div>
  );
}
```

## Integration with Admin Catalog Page

```tsx
'use client';

import { useState } from 'react';
import { ProductCreateDialog } from '@/components/catalog';
import { Button } from '@/components/ui/button';

export default function CatalogPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Catalog</h1>
          <p className="text-muted-foreground">Manage your product catalog</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Product
        </Button>
      </div>

      {/* Your existing catalog components */}
      {/* ... */}

      {/* Create Product Dialog */}
      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}
```

## Props API

### ProductCreateDialogProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `open` | `boolean` | Yes | Controls whether the dialog is open |
| `onOpenChange` | `(open: boolean) => void` | Yes | Callback when dialog open state changes |
| `onSuccess` | `(productId: string) => void` | No | Optional callback after successful product creation |

## Features

### 1. Form Validation

All fields are validated using Zod schema:

- **Product Name**: Required, 3-255 characters
- **Brand**: Required, 2-100 characters
- **Short Description**: Required, 10-500 characters
- **Price**: Required, positive number, max 1,000,000
- **MSRP**: Optional, positive number, max 1,000,000
- **Category**: Required, must be valid UUID
- **Status**: Required, either 'draft' or 'in_review'
- **Tags/Materials/Colors/Style Tags**: Optional arrays

### 2. Multi-Input Fields

Tags, materials, colors, and style tags use a custom multi-input component:

- Press **Enter** or **comma** to add a value
- Press **Backspace** (when input is empty) to remove the last value
- Click the **X** button on any tag to remove it
- Prevents duplicate entries

### 3. Category Loading

Categories are automatically loaded from the API when the dialog opens:

- Shows loading state while fetching
- Displays error toast if loading fails
- Populates dropdown with available categories

### 4. API Integration

Uses TanStack Query for optimal performance:

- Automatic retry on failure
- Query invalidation on success (refreshes product list)
- Optimistic updates
- Loading and error states

### 5. User Feedback

- **Loading State**: Shows spinner and "Creating..." text during submission
- **Success Toast**: Displays confirmation message with product name
- **Error Toast**: Shows detailed error messages
- **Form Reset**: Automatically resets form after successful creation
- **Auto-close**: Dialog closes on successful creation

## Form Data Transformation

The component transforms form data before sending to the API:

```typescript
const productData: CreateProductRequest = {
  name: data.name,
  brand: data.brand,
  category: 'sofa', // Placeholder - overridden by categoryId
  categoryId: data.categoryId,
  shortDescription: data.shortDescription,
  price: data.price,
  currency: 'USD', // Default currency
  status: data.status,
  msrp: data.msrp,
  tags: data.tags.length > 0 ? data.tags : undefined,
  materials: data.materials.length > 0 ? data.materials : undefined,
  colors: data.colors.length > 0 ? data.colors : undefined,
  styleTags: data.styleTags.length > 0 ? data.styleTags : undefined,
};
```

## Error Handling

The component handles errors at multiple levels:

### Category Loading Errors
```typescript
try {
  const response = await catalogService.getCategories();
  // ...
} catch (error) {
  toast.error('Failed to load categories', {
    description: error instanceof Error ? error.message : 'Unknown error occurred',
  });
}
```

### Form Submission Errors
```typescript
try {
  const result = await createProductMutation.mutateAsync(productData);
  // Success handling
} catch (error) {
  toast.error('Failed to create product', {
    description: error instanceof Error ? error.message : 'An unexpected error occurred',
  });
}
```

### Validation Errors
React Hook Form automatically displays validation errors inline below each field.

## Accessibility Features

- Proper ARIA labels and descriptions
- Error messages associated with form fields via `aria-describedby`
- Invalid state indicated via `aria-invalid`
- Keyboard navigation support
- Focus management (returns to trigger after close)
- Screen reader announcements for errors and success

## Styling

The component uses Tailwind CSS and follows the admin portal design system:

- Consistent spacing and sizing
- Responsive layout
- Maximum height with scroll for long forms
- Clear visual hierarchy
- Accessible color contrast

## Best Practices

### 1. State Management
```tsx
// Keep dialog state in parent component
const [isOpen, setIsOpen] = useState(false);
```

### 2. Success Callback
```tsx
// Use the onSuccess callback for navigation or additional actions
<ProductCreateDialog
  open={isOpen}
  onOpenChange={setIsOpen}
  onSuccess={(productId) => {
    // Navigate to product detail
    router.push(`/catalog/products/${productId}`);

    // Or show additional confirmation
    console.log('Created product ID:', productId);
  }}
/>
```

### 3. Form Reset
The form automatically resets when the dialog closes. No manual reset needed.

### 4. Query Invalidation
The mutation automatically invalidates product queries, so lists refresh automatically.

## Testing

### Unit Tests
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductCreateDialog } from './product-create-dialog';

describe('ProductCreateDialog', () => {
  it('should render when open', () => {
    render(
      <ProductCreateDialog
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create New Product')).toBeInTheDocument();
  });

  it('should show validation errors', async () => {
    render(
      <ProductCreateDialog
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    const submitButton = screen.getByRole('button', { name: /create product/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/product name is required/i)).toBeInTheDocument();
    });
  });
});
```

### E2E Tests (Playwright)
```typescript
test('create new product flow', async ({ page }) => {
  await page.goto('/catalog');

  // Open dialog
  await page.click('button:has-text("Create Product")');

  // Fill form
  await page.fill('#name', 'Test Sofa');
  await page.fill('#brand', 'Test Brand');
  await page.fill('#shortDescription', 'A beautiful test sofa');
  await page.fill('#price', '999.99');
  await page.selectOption('#categoryId', { index: 1 });

  // Submit
  await page.click('button:has-text("Create Product")');

  // Verify success
  await expect(page.locator('text=Product created successfully')).toBeVisible();
});
```

## Troubleshooting

### Dialog doesn't open
- Ensure `open` prop is `true`
- Check that the parent component's state is updating

### Categories don't load
- Verify catalog service is running
- Check network tab for API errors
- Ensure authentication is valid

### Form doesn't submit
- Check browser console for validation errors
- Verify all required fields are filled
- Check network tab for API request/response

### Success callback not firing
- Ensure `onSuccess` is provided as a prop
- Check that mutation is completing successfully
- Verify product ID is being extracted from response

## Related Components

- `AdminCatalogFilters` - Filter products by various criteria
- `AdminProductTable` - Display products in table view
- `BulkActionDialogs` - Bulk operations on products
- `useCreateProduct` - TanStack Query hook for creating products

## Future Enhancements

Potential improvements for future iterations:

1. **Long Description Field**: Add rich text editor for detailed descriptions
2. **Image Upload**: Allow uploading product images during creation
3. **Variant Creation**: Add initial variants in the same dialog
4. **Template Selection**: Start from product templates
5. **Draft Auto-save**: Automatically save drafts to localStorage
6. **Advanced Validation**: Server-side validation integration
7. **Duplicate Detection**: Warn about similar existing products
8. **Batch Import**: Link to bulk import from CSV
