# Variant Management Feature Guide

## Overview

The Variant Management feature provides a comprehensive interface for managing product variants in the Admin Portal. It includes inline editing, bulk CSV import/export, real-time validation, and optimistic updates for a seamless user experience.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Usage](#usage)
- [API Integration](#api-integration)
- [Validation Rules](#validation-rules)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [CSV Import/Export](#csv-importexport)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Features

### Core Functionality

- **Inline Editing Table**: Edit variants directly in the table view
- **CRUD Operations**: Create, Read, Update, Delete variants
- **Bulk CSV Import**: Import multiple variants from a CSV file
- **CSV Export**: Export all variants to CSV format
- **Real-time Validation**: Client-side validation with immediate feedback
- **Optimistic Updates**: Instant UI updates while mutations process
- **Loading States**: Skeleton loaders and pending states
- **Error Handling**: Comprehensive error messages and recovery
- **Keyboard Shortcuts**: Keyboard-first workflow support

### Validation Features

- **SKU Uniqueness**: Prevents duplicate SKUs
- **Price Validation**: Ensures prices are positive numbers
- **Stock Validation**: Ensures stock is a non-negative integer
- **Required Fields**: SKU is required for all variants
- **Options Validation**: JSON format validation for variant options

---

## Architecture

### Component Structure

```
variant-editor.tsx
├── VariantEditor (Main Component)
│   ├── VariantRowDisplay (Read Mode)
│   ├── VariantRowEdit (Edit Mode)
│   ├── EmptyVariantsState (Empty State)
│   ├── VariantEditorSkeleton (Loading State)
│   └── ImportCSVDialog (Import Dialog)
```

### Hooks Used

```typescript
// Data Fetching
useVariants(productId)           // Fetch variants for a product
useVariant(variantId)            // Fetch single variant (future)

// Mutations
useCreateVariant()               // Create new variant
useUpdateVariant()               // Update existing variant
useDeleteVariant()               // Delete variant
useBulkCreateVariants()          // Bulk import from CSV
useCheckSkuUniqueness()          // Validate SKU uniqueness
```

### Data Flow

```
┌─────────────────┐
│  VariantEditor  │
└────────┬────────┘
         │
         ├─── useVariants(productId)
         │    └─── catalogService.getProduct()
         │         └─── API: GET /products/{id}
         │
         ├─── useCreateVariant()
         │    └─── catalogService.createVariant()
         │         └─── API: POST /products/{id}/variants
         │
         ├─── useUpdateVariant()
         │    └─── catalogService.updateVariant()
         │         └─── API: PATCH /variants/{id}
         │
         └─── useDeleteVariant()
              └─── catalogService.deleteVariant()
                   └─── API: DELETE /variants/{id}
```

---

## Usage

### Basic Integration

The `VariantEditor` is integrated into the Product Edit Page:

```tsx
// apps/admin-portal/src/app/(dashboard)/catalog/[productId]/page.tsx

import { VariantEditor } from '@/components/catalog/variant-editor';

export default function ProductEditPage({ params }: ProductEditPageProps) {
  return (
    <Tabs>
      <TabsContent value="variants">
        <VariantEditor productId={params.productId} />
      </TabsContent>
    </Tabs>
  );
}
```

### Component Props

```typescript
interface VariantEditorProps {
  productId: string;                          // Required: Product UUID
  onVariantsChange?: (variants: Variant[]) => void;  // Optional: Callback when variants change
}
```

### Example Usage with Callback

```tsx
function ProductPage() {
  const [variantCount, setVariantCount] = useState(0);

  const handleVariantsChange = (variants: Variant[]) => {
    setVariantCount(variants.length);
    console.log('Variants updated:', variants);
  };

  return (
    <VariantEditor
      productId="prod-123"
      onVariantsChange={handleVariantsChange}
    />
  );
}
```

---

## API Integration

### Backend Endpoints

The component integrates with the following catalog service endpoints:

#### 1. Get Product (includes variants)
```
GET /products/{productId}

Response:
{
  "data": {
    "id": "prod-123",
    "name": "Modern Sofa",
    "variants": [
      {
        "id": "var-1",
        "sku": "SKU-001",
        "price": 99.99,
        ...
      }
    ]
  }
}
```

#### 2. Create Variant
```
POST /products/{productId}/variants

Request Body:
{
  "sku": "SKU-001",
  "name": "Red Variant",
  "options": { "color": "Red", "size": "Large" },
  "price": 99.99,
  "quantity": 10,
  "availabilityStatus": "in_stock"
}

Response:
{
  "data": {
    "id": "var-1",
    "sku": "SKU-001",
    ...
  }
}
```

#### 3. Update Variant
```
PATCH /variants/{variantId}

Request Body:
{
  "price": 109.99,
  "quantity": 15
}

Response:
{
  "data": {
    "id": "var-1",
    "price": 109.99,
    ...
  }
}
```

#### 4. Delete Variant
```
DELETE /variants/{variantId}

Response: 204 No Content
```

### API Client Methods

Located in `/apps/admin-portal/src/services/catalog.ts`:

```typescript
// Create variant
catalogService.createVariant(productId, data)

// Update variant
catalogService.updateVariant(variantId, data)

// Delete variant
catalogService.deleteVariant(variantId)
```

---

## Validation Rules

### Client-Side Validation

Implemented using Zod schema:

```typescript
const variantSchema = z.object({
  sku: z.string()
    .min(1, 'SKU is required')
    .max(100, 'SKU too long'),

  name: z.string().optional(),

  barcode: z.string().optional(),

  price: z.number()
    .min(0, 'Price must be positive')
    .optional(),

  quantity: z.number()
    .int('Must be an integer')
    .min(0, 'Stock cannot be negative')
    .optional(),

  availabilityStatus: z.enum([
    'in_stock',
    'out_of_stock',
    'preorder',
    'discontinued',
    'backorder'
  ]),

  options: z.record(z.string(), z.string()),
});
```

### Validation Error Messages

| Field | Validation | Error Message |
|-------|-----------|---------------|
| SKU | Required | "SKU is required" |
| SKU | Max length | "SKU too long" |
| Price | Minimum 0 | "Price must be positive" |
| Quantity | Integer | "Must be an integer" |
| Quantity | Minimum 0 | "Stock cannot be negative" |
| Options | Valid JSON | Inline JSON validation |

### SKU Uniqueness Check

The component checks for duplicate SKUs before saving:

```typescript
// Existing SKUs are passed to edit form
const existingSkus = variants
  .filter(v => v.id !== editingVariantId)
  .map(v => v.sku);

// Validation prevents duplicates
if (existingSkus.includes(newSku)) {
  // Show error
}
```

---

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Save current edit |
| `Escape` | Cancel current edit |

### Usage in Edit Mode

When editing a variant row:

1. **Save Changes**: Press `Cmd+Enter` (Mac) or `Ctrl+Enter` (Windows/Linux)
2. **Cancel Edit**: Press `Escape`

### Example

```
1. Click "Edit" on a variant row
2. Modify the price field
3. Press Cmd+Enter to save
   OR
   Press Escape to cancel
```

---

## CSV Import/Export

### CSV Export

#### Format

Exported CSV includes these columns:

```csv
SKU,Name,Barcode,Price,Quantity,Availability Status,Options
SKU-001,Red Variant,123456789,99.99,10,in_stock,"{""color"":""Red""}"
SKU-002,Blue Variant,987654321,89.99,5,in_stock,"{""color"":""Blue""}"
```

#### Usage

1. Click **"Export CSV"** button
2. File downloads as `variants-{productId}.csv`
3. Open in Excel, Google Sheets, or any CSV editor

### CSV Import

#### Format Requirements

Your CSV must include these columns:

- **SKU** (required)
- **Name** (optional)
- **Barcode** (optional)
- **Price** (optional)
- **Quantity** (optional)
- **Availability Status** (optional, default: "in_stock")
- **Options** (optional, must be valid JSON)

#### Example CSV

```csv
SKU,Name,Price,Quantity,Availability Status,Options
SKU-003,Green Variant,79.99,15,in_stock,"{""color"":""Green"",""size"":""Large""}"
SKU-004,Yellow Variant,69.99,20,preorder,"{""color"":""Yellow"",""size"":""Medium""}"
```

#### Import Process

1. Click **"Import CSV"** button
2. Select your CSV file
3. Review the file details
4. Click **"Import"**
5. System validates and creates variants
6. Shows success message with count

#### Duplicate Handling

- Import automatically filters out SKUs that already exist
- Only new SKUs are imported
- You'll see a message: "Successfully imported X of Y variants"

#### Error Handling

Common import errors:

| Error | Cause | Solution |
|-------|-------|----------|
| "No variants found" | Empty CSV or no valid data | Check CSV format |
| "Invalid file type" | Not a .csv file | Convert to CSV format |
| "No new variants" | All SKUs already exist | Review SKUs for duplicates |
| "Import failed" | Server error | Check network and retry |

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm --filter @patina/admin-portal test

# Run variant-editor tests specifically
pnpm --filter @patina/admin-portal test variant-editor

# Run with coverage
pnpm --filter @patina/admin-portal test:coverage
```

### Test Coverage

The test suite includes:

- **Rendering Tests**: Component display states
- **CRUD Tests**: Create, update, delete operations
- **Validation Tests**: All validation rules
- **CSV Tests**: Import and export functionality
- **Keyboard Tests**: Keyboard shortcut handling
- **Error Tests**: Error handling and recovery
- **Optimistic Update Tests**: UI responsiveness

### Test File Location

```
apps/admin-portal/src/components/catalog/__tests__/variant-editor.test.tsx
```

### Example Test Run

```bash
$ pnpm test variant-editor

PASS  src/components/catalog/__tests__/variant-editor.test.tsx
  VariantEditor
    Rendering
      ✓ should render the component with variants (120ms)
      ✓ should display all variants in table (85ms)
      ✓ should show loading state (45ms)
      ✓ should show error state (52ms)
      ✓ should show empty state when no variants (38ms)
    Create Variant
      ✓ should open add variant form (65ms)
      ✓ should create a new variant with valid data (180ms)
      ✓ should validate required SKU field (90ms)
      ...
```

---

## Troubleshooting

### Common Issues

#### 1. Variants Not Loading

**Symptoms**: Spinner shows indefinitely, no variants display

**Causes**:
- Network error
- Invalid product ID
- Backend service down

**Solutions**:
```bash
# Check if catalog service is running
curl http://localhost:3011/health

# Verify product ID is valid
# Check browser console for errors
# Click "Try Again" button
```

#### 2. SKU Uniqueness Validation Not Working

**Symptoms**: Can save duplicate SKUs

**Causes**:
- Client-side validation bypassed
- Backend validation not enforced

**Solutions**:
- Ensure form validation runs before submit
- Check backend SKU unique constraint
- Review error logs

#### 3. CSV Import Fails

**Symptoms**: Error message on import

**Common Causes**:

| Issue | Solution |
|-------|----------|
| Wrong file format | Ensure file is .csv, not .xlsx or .txt |
| Invalid JSON in Options | Use proper JSON escaping: `"{""key"":""value""}"` |
| Missing required columns | Include at least SKU column |
| Special characters | Use UTF-8 encoding |

**Debug Steps**:
1. Open CSV in text editor
2. Check for hidden characters
3. Validate JSON in Options column
4. Ensure headers match exactly

#### 4. Optimistic Update Rollback

**Symptoms**: Changes revert after saving

**Causes**:
- Server returned error
- Network timeout
- Validation failed on backend

**Solutions**:
- Check network tab in DevTools
- Review backend error logs
- Verify data matches backend schema

#### 5. Keyboard Shortcuts Not Working

**Symptoms**: Cmd+Enter or Escape doesn't work

**Causes**:
- Focus not on edit form
- Event listener not attached
- Browser extension interference

**Solutions**:
- Click inside form input first
- Try tabbing to focus form
- Disable browser extensions temporarily

### Getting Help

If you encounter issues not covered here:

1. **Check Browser Console**: Look for JavaScript errors
2. **Check Network Tab**: Review API request/response
3. **Review Backend Logs**: Check catalog service logs
4. **Check Test Suite**: Run tests to verify functionality
5. **Create Issue**: Document the issue with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots
   - Browser and OS version

### Debug Mode

Enable debug logging:

```typescript
// In variant-editor.tsx, add:
console.log('Variants loaded:', variants);
console.log('Mutation result:', result);
```

---

## Best Practices

### 1. Data Entry

- **Use consistent SKU format**: e.g., `PROD-001`, `PROD-002`
- **Fill all relevant fields**: Price, quantity, availability
- **Use meaningful names**: Help identify variants quickly
- **Organize options**: Use consistent keys (color, size, material)

### 2. CSV Management

- **Template approach**: Export existing variants as template
- **Batch imports**: Group related variants in single CSV
- **Validate first**: Open CSV in editor before importing
- **Backup data**: Export before bulk changes

### 3. Performance

- **Limit variants**: Keep under 100 variants per product for optimal performance
- **Use pagination**: If many variants, consider pagination (future feature)
- **Optimize images**: Variant images should be optimized

### 4. Workflow

Recommended workflow for adding multiple variants:

```
1. Export existing variants (if any)
2. Open CSV in spreadsheet software
3. Add new rows with variant data
4. Save as CSV
5. Import CSV
6. Review imported variants
7. Make any final adjustments inline
```

---

## Future Enhancements

Planned features for future releases:

- [ ] **Bulk Edit**: Select multiple variants and edit in bulk
- [ ] **Variant Templates**: Save and reuse variant configurations
- [ ] **Advanced Filtering**: Filter variants by options, price, stock
- [ ] **Pagination**: Handle products with 100+ variants
- [ ] **Variant Images**: Upload images specific to each variant
- [ ] **Price Calculator**: Auto-calculate prices based on base price + modifiers
- [ ] **Inventory Sync**: Real-time inventory updates from warehouse
- [ ] **History Tracking**: View edit history for each variant
- [ ] **Duplicate Variant**: Clone existing variant to create similar ones
- [ ] **SKU Generator**: Auto-generate SKUs based on options

---

## Changelog

### Version 1.0.0 (Current)

**Features**:
- ✅ Inline editing table
- ✅ CRUD operations
- ✅ CSV import/export
- ✅ Real-time validation
- ✅ Optimistic updates
- ✅ Keyboard shortcuts
- ✅ Loading and error states
- ✅ Comprehensive test suite
- ✅ Full documentation

**Known Issues**:
- SKU uniqueness check is client-side only (backend validation needed)
- No pagination for products with 100+ variants
- Bulk edit not yet implemented

---

## Support

For questions or issues:

- **Documentation**: This file
- **Code**: `/apps/admin-portal/src/components/catalog/variant-editor.tsx`
- **Tests**: `/apps/admin-portal/src/components/catalog/__tests__/variant-editor.test.tsx`
- **Hooks**: `/apps/admin-portal/src/hooks/use-variants.ts`
- **API Service**: `/apps/admin-portal/src/services/catalog.ts`

---

**Last Updated**: 2025-10-19
**Author**: Claude Code
**Version**: 1.0.0
