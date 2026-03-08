# Product Edit Page - Quick Start Guide

## Accessing the Page

### From Catalog List
```typescript
// Navigate from product list
<Link href={`/catalog/${product.id}`}>
  Edit Product
</Link>
```

### Direct URL
```
/catalog/[productId]
```

Example: `/catalog/550e8400-e29b-41d4-a716-446655440000`

## Basic Usage

### 1. Load Product
The page automatically fetches the product based on the URL parameter:

```typescript
// Automatic in the component
const { product, isLoading, error } = useProduct(params.productId);
```

### 2. Edit Product Details

**Navigate to Details Tab** → Edit fields → Click "Save Changes"

Required fields:
- Product Name
- Brand
- Short Description
- Price

### 3. Update SEO

**Navigate to SEO Tab** → Edit meta fields → Click "Save Changes"

Best practices:
- Slug: `lowercase-with-hyphens`
- SEO Title: 50-60 characters
- SEO Description: 120-160 characters

### 4. Publish/Unpublish

Click the "Publish" or "Unpublish" button in the header.

**Note**: Publishing validates the product first.

### 5. Delete Product

Click "Delete" → Confirm in dialog → Product removed and redirected to catalog.

## Code Examples

### Adding a Custom Field

```typescript
// 1. Update schema
const productDetailsSchema = z.object({
  // ... existing fields
  customField: z.string().optional(),
});

// 2. Add to form
<div className="space-y-2">
  <Label htmlFor="customField">Custom Field</Label>
  <Input
    id="customField"
    {...register('customField')}
    placeholder="Enter custom value"
  />
</div>

// 3. Include in save
const handleSave = async () => {
  const data = detailsForm.getValues();
  await updateProductMutation.mutateAsync({
    productId: params.productId,
    data: {
      ...data,
      customField: data.customField,
    },
  });
};
```

### Adding Validation

```typescript
// Custom validation rule
const productDetailsSchema = z.object({
  name: z.string()
    .min(1, 'Name required')
    .max(200, 'Name too long')
    .refine(
      (val) => !val.toLowerCase().includes('banned'),
      'Name contains prohibited words'
    ),
});
```

### Custom Toast Message

```typescript
// Success with custom action
toast({
  title: 'Product published',
  description: `${product.name} is now live`,
  action: (
    <Button
      size="sm"
      onClick={() => window.open(`/products/${product.slug}`, '_blank')}
    >
      View Live
    </Button>
  ),
});

// Error with details
toast({
  title: 'Validation Failed',
  description: (
    <div className="space-y-1">
      <p>Please fix the following:</p>
      <ul className="list-disc list-inside text-xs">
        <li>Product name is required</li>
        <li>Price must be positive</li>
      </ul>
    </div>
  ),
  variant: 'destructive',
});
```

### Implementing Auto-Save

```typescript
import { useDebouncedCallback } from 'use-debounce';

// In component
const debouncedSave = useDebouncedCallback(
  async () => {
    if (!hasUnsavedChanges) return;

    setIsAutoSaving(true);
    try {
      await handleSave();
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsAutoSaving(false);
    }
  },
  3000 // 3 second delay
);

// Watch form changes
useEffect(() => {
  const subscription = detailsForm.watch(() => {
    setHasUnsavedChanges(true);
    debouncedSave();
  });
  return () => subscription.unsubscribe();
}, [detailsForm, debouncedSave]);
```

### Custom Tab Implementation

```typescript
// Add a new tab
<TabsContent value="inventory">
  <InventoryTab productId={params.productId} />
</TabsContent>

// Create tab component
function InventoryTab({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(0);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Inventory Management</h3>
      <div className="space-y-2">
        <Label htmlFor="quantity">Stock Quantity</Label>
        <Input
          id="quantity"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
```

## Common Patterns

### Conditional Field Display

```typescript
// Show sale price only if there's a sale
const showSalePrice = watch('msrp') > watch('price');

{showSalePrice && (
  <div className="space-y-2">
    <Label htmlFor="salePrice">Sale Price</Label>
    <Input
      id="salePrice"
      type="number"
      {...register('salePrice', { valueAsNumber: true })}
    />
  </div>
)}
```

### Dynamic Validation

```typescript
// Validate sale price is less than MSRP
const productDetailsSchema = z.object({
  price: z.number().min(0),
  msrp: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
}).refine(
  (data) => {
    if (data.salePrice && data.msrp) {
      return data.salePrice < data.msrp;
    }
    return true;
  },
  {
    message: 'Sale price must be less than MSRP',
    path: ['salePrice'],
  }
);
```

### Optimistic Updates

```typescript
const updateProductMutation = useUpdateProduct({
  // Optimistic update configuration
  onMutate: async (variables) => {
    // Cancel outgoing queries
    await queryClient.cancelQueries({
      queryKey: ['admin-products', 'detail', variables.productId],
    });

    // Snapshot current value
    const previousProduct = queryClient.getQueryData([
      'admin-products',
      'detail',
      variables.productId,
    ]);

    // Optimistically update
    queryClient.setQueryData(
      ['admin-products', 'detail', variables.productId],
      (old: any) => ({ ...old, data: { ...old.data, ...variables.data } })
    );

    return { previousProduct };
  },

  // Rollback on error
  onError: (err, variables, context) => {
    if (context?.previousProduct) {
      queryClient.setQueryData(
        ['admin-products', 'detail', variables.productId],
        context.previousProduct
      );
    }
  },
});
```

### Field Array (Multiple Values)

```typescript
// For managing product tags
import { useFieldArray } from 'react-hook-form';

const { fields, append, remove } = useFieldArray({
  control: detailsForm.control,
  name: 'tags',
});

// Render
<div className="space-y-2">
  <Label>Tags</Label>
  {fields.map((field, index) => (
    <div key={field.id} className="flex gap-2">
      <Input {...register(`tags.${index}.value`)} />
      <Button
        type="button"
        variant="destructive"
        size="icon"
        onClick={() => remove(index)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  ))}
  <Button
    type="button"
    variant="outline"
    onClick={() => append({ value: '' })}
  >
    Add Tag
  </Button>
</div>
```

## Keyboard Shortcuts (Future Enhancement)

```typescript
// Add keyboard shortcuts
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    // Save: Cmd/Ctrl + S
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }

    // Publish: Cmd/Ctrl + P
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      handlePublishToggle();
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, [handleSave, handlePublishToggle]);
```

## Troubleshooting

### Problem: Product data not loading
**Solution:**
```typescript
// Check if productId is valid
console.log('Product ID:', params.productId);

// Check API response
const { product, error, isLoading } = useProduct(params.productId);
console.log({ product, error, isLoading });
```

### Problem: Form not validating
**Solution:**
```typescript
// Manually trigger validation
const isValid = await detailsForm.trigger();
if (!isValid) {
  console.log('Validation errors:', detailsForm.formState.errors);
}
```

### Problem: Mutations not updating UI
**Solution:**
```typescript
// Check if query invalidation is working
const queryClient = useQueryClient();

// After mutation
await updateProductMutation.mutateAsync(data);
await queryClient.invalidateQueries({
  queryKey: ['admin-products', 'detail', productId],
});

// Force refetch
await refetch();
```

### Problem: Unsaved changes not detected
**Solution:**
```typescript
// Check if form values match default values
console.log('Current values:', detailsForm.getValues());
console.log('Default values:', detailsForm.formState.defaultValues);
console.log('Is dirty:', detailsForm.formState.isDirty);
```

## Testing

### Manual Testing Checklist

- [ ] Product loads correctly
- [ ] All tabs accessible
- [ ] Form validation works
- [ ] Save updates product
- [ ] Unsaved changes warning appears
- [ ] Publish/unpublish works
- [ ] Delete confirmation appears
- [ ] Delete removes product
- [ ] Back button navigates to catalog
- [ ] Toast notifications appear
- [ ] Loading states show correctly
- [ ] Error states display properly

### Unit Test Example

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductEditPage from './page';

test('should update product name', async () => {
  const user = userEvent.setup();

  render(<ProductEditPage params={{ productId: 'test-id' }} />);

  // Wait for product to load
  await waitFor(() => {
    expect(screen.getByLabelText('Product Name')).toBeInTheDocument();
  });

  // Edit name
  const nameInput = screen.getByLabelText('Product Name');
  await user.clear(nameInput);
  await user.type(nameInput, 'New Product Name');

  // Save
  const saveButton = screen.getByRole('button', { name: /save/i });
  await user.click(saveButton);

  // Verify success
  await waitFor(() => {
    expect(screen.getByText(/product saved/i)).toBeInTheDocument();
  });
});
```

## Performance Tips

1. **Debounce expensive operations**
   ```typescript
   const debouncedValidation = useDebouncedCallback(
     () => detailsForm.trigger(),
     500
   );
   ```

2. **Memoize callbacks**
   ```typescript
   const handleFieldChange = useCallback((value: string) => {
     // Handle change
   }, [/* dependencies */]);
   ```

3. **Use query stale time appropriately**
   ```typescript
   useProduct(productId, {
     staleTime: 10 * 60 * 1000, // 10 minutes
   });
   ```

4. **Lazy load heavy components**
   ```typescript
   const RichTextEditor = lazy(() => import('@/components/rich-text-editor'));
   ```

## Next Steps

1. Review the [full documentation](./PRODUCT_EDIT_PAGE_DOCUMENTATION.md)
2. Check [type definitions](./src/types/admin-catalog.ts)
3. Explore [custom hooks](./src/hooks/use-admin-products.ts)
4. Review [UI components](./src/components/ui/)
