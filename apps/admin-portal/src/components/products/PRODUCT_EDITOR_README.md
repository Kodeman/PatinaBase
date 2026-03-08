# Product Editor Modal Component (Admin Portal)

## Overview

The Product Editor Modal is a comprehensive, tabbed interface for editing product information in the Admin Portal. It follows the Visual Preservation Guide (section 3.3) specifications to ensure brand consistency and optimal user experience across both portals.

## Component Location

```
/home/middle/patina/apps/admin-portal/src/components/products/product-editor-modal.tsx
```

## Differences from Designer Portal

This component is functionally identical to the Designer Portal version but uses Admin Portal-specific UI components:
- Local UI primitives from `@/components/ui/*`
- Admin Portal styling tokens
- Same Visual Preservation Guide compliance

## Features

### Core Features
- **90vh x 90vw Dialog**: Large modal sized to maximize workspace while maintaining context
- **Tabbed Interface**: Five organized sections (Details, Media, Pricing, Inventory, SEO)
- **Responsive Design**: Horizontal scroll tabs on mobile, five-column grid on desktop
- **Save State Indicators**: Real-time visual feedback (Saved/Saving/Error)
- **Navigation System**: Previous/Next buttons with progress indicator
- **ScrollArea Integration**: Each tab panel wrapped in scrollable container

### Visual Specifications

#### Header
- **Media Thumbnail**:
  - Size: `w-10 h-10` on mobile, `w-12 h-12` on desktop
  - Background: `bg-muted` with `rounded` corners
  - Displays primary product image or placeholder icon

- **Product Info Stack**:
  - Product name (truncated with ellipsis)
  - SKU display in muted text

- **Save State Badge**:
  - Success variant for "Saved"
  - Secondary variant for "Saving..."
  - Destructive variant for "Error"
  - 200ms transition timing

#### Tab System
- **Mobile Layout**: Horizontal scrolling strip with flexible gap spacing
- **Desktop Layout**: Five-column grid (`grid-cols-5`)
- **Tab Triggers**:
  - Icon + label combination
  - Active state: elevated background with shadow
  - 200ms transition on all state changes

#### Tab Icons
- Details: FileText
- Media: Image
- Pricing: DollarSign
- Inventory: Package
- SEO: Search

#### Footer
- **Previous Button**: Outline variant, disabled on first tab
- **Progress Meter**: "Step X of 5" centered text
- **Next Button**: Outline variant, disabled on last tab
- All buttons use 200ms transitions

## Props Interface

```typescript
interface ProductEditorModalProps {
  open: boolean;                          // Controls modal visibility
  onOpenChange: (open: boolean) => void;  // Callback when modal opens/closes
  product?: Product;                      // Product data to edit (optional for new products)
  onSave: (product: Product) => Promise<void>; // Save handler
  activeTab?: string;                     // Controlled active tab (optional)
  onTabChange?: (tab: string) => void;    // Tab change callback (optional)
}
```

### Product Type
Uses the `Product` type from `@patina/types`:

```typescript
interface Product {
  id: UUID;
  name: string;
  description: string;
  category: ProductCategory;
  manufacturerId: UUID;
  basePrice: number;
  currency: string;
  status: Status;
  images: ProductImage[];
  dimensions: Dimensions;
  materials: string[];
  customizable: boolean;
  customizationOptions?: CustomizationOption[];
}
```

## Usage Examples

### Basic Usage (Uncontrolled)

```tsx
import { ProductEditorModal } from '@/components/products/product-editor-modal';
import { useState } from 'react';

function ProductManagement() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();

  const handleSave = async (product: Product) => {
    // Admin-specific save logic
    await adminApi.updateProduct(product);
    setIsOpen(false);
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Edit Product
      </button>

      <ProductEditorModal
        open={isOpen}
        onOpenChange={setIsOpen}
        product={selectedProduct}
        onSave={handleSave}
      />
    </>
  );
}
```

### Admin-Specific Features

```tsx
import { ProductEditorModal } from '@/components/products/product-editor-modal';
import { useState } from 'react';
import { useAdminPermissions } from '@/hooks/use-admin-permissions';

function AdminProductEditor() {
  const [isOpen, setIsOpen] = useState(false);
  const [product, setProduct] = useState<Product>();
  const { canEditPricing, canManageInventory } = useAdminPermissions();

  const handleSave = async (product: Product) => {
    // Validate admin permissions
    if (!canEditPricing && hasChangedPricing(product)) {
      toast.error('You do not have permission to edit pricing');
      return;
    }

    await adminApi.saveProduct(product);
  };

  return (
    <ProductEditorModal
      open={isOpen}
      onOpenChange={setIsOpen}
      product={product}
      onSave={handleSave}
    />
  );
}
```

### With Audit Logging

```tsx
import { ProductEditorModal } from '@/components/products/product-editor-modal';
import { useAuditLog } from '@/hooks/use-audit-log';

function AuditedProductEditor() {
  const [isOpen, setIsOpen] = useState(false);
  const { logAction } = useAuditLog();

  const handleSave = async (product: Product) => {
    await adminApi.updateProduct(product);

    // Log admin action
    await logAction({
      action: 'product_updated',
      resourceId: product.id,
      changes: getProductChanges(product),
      timestamp: new Date(),
    });
  };

  const handleTabChange = (tab: string) => {
    logAction({
      action: 'tab_viewed',
      tab,
      timestamp: new Date(),
    });
  };

  return (
    <ProductEditorModal
      open={isOpen}
      onOpenChange={setIsOpen}
      onSave={handleSave}
      onTabChange={handleTabChange}
    />
  );
}
```

## Admin Portal Specific Considerations

### Permissions
Implement permission checks for:
- Editing product details
- Managing pricing
- Updating inventory
- Publishing products
- Deleting products

### Audit Trail
Track all changes made through the editor:
- Who made the change
- What was changed
- When it was changed
- Previous and new values

### Bulk Operations
Admin portal may need additional features:
- Bulk edit multiple products
- Clone product functionality
- Import/Export capabilities

## Tab Configuration

The component uses a `tabConfig` array to define tabs:

```typescript
const tabConfig: TabConfig[] = [
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'seo', label: 'SEO', icon: SearchIcon },
];
```

## Dependencies

### UI Components
- `Dialog`, `DialogContent` from `@/components/ui/dialog`
- `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs`
- `ScrollArea` from `@/components/ui/scroll-area`
- `Button` from `@/components/ui/button`
- `Badge` from `@/components/ui/badge`

### Types
- `Product` from `@patina/types`

### Icons
- Lucide React icons: `X`, `ChevronLeft`, `ChevronRight`, `FileText`, `Image`, `DollarSign`, `Package`, `Search`

## Styling Specifications

### Design Tokens Used
- `bg-muted`: Thumbnail background, tab list
- `border-border`: Separators
- `text-muted-foreground`: Secondary text
- `transition-all duration-200`: All interactive elements

### Responsive Breakpoints
- Mobile: Default styles
- Desktop (md): `md:w-12 md:h-12`, `md:grid md:grid-cols-5`

## Accessibility Features

- **Keyboard Navigation**: Tab through all controls
- **ESC Key**: Closes modal
- **Focus Management**: Proper tab order
- **ARIA Labels**: Semantic HTML structure
- **Screen Reader Support**: All icons have text labels

## Testing

### Admin Portal Specific Tests

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductEditorModal } from './product-editor-modal';

describe('ProductEditorModal (Admin)', () => {
  it('enforces admin permissions', async () => {
    const mockSave = jest.fn();
    const product = { name: 'Test', id: '123' };

    render(
      <ProductEditorModal
        open={true}
        onOpenChange={() => {}}
        product={product}
        onSave={mockSave}
      />
    );

    // Test permission checks
    // ...
  });

  it('logs audit trail', async () => {
    const mockAuditLog = jest.fn();
    // Test audit logging
    // ...
  });
});
```

## Integration Points

### With Admin API
```typescript
// services/admin-api.ts
export const adminApi = {
  updateProduct: async (product: Product) => {
    const response = await fetch(`/api/admin/products/${product.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    return response.json();
  },
};
```

### With Permission System
```typescript
// hooks/use-admin-permissions.ts
export function useAdminPermissions() {
  const { user } = useAuth();

  return {
    canEditPricing: user?.role === 'admin' || user?.permissions.includes('edit_pricing'),
    canManageInventory: user?.role === 'admin' || user?.permissions.includes('manage_inventory'),
    // ... other permissions
  };
}
```

## Migration from Designer Portal

If migrating code from Designer Portal:
1. Update import paths to use Admin Portal UI components
2. Add admin-specific permission checks
3. Implement audit logging
4. Adjust save handlers for admin API endpoints
5. Test with admin-specific workflows

## Future Enhancements

- [ ] Implement actual tab panel forms
- [ ] Add validation error display
- [ ] Implement auto-save functionality
- [ ] Add unsaved changes warning
- [ ] Support for draft/preview modes
- [ ] Keyboard shortcuts for tab navigation
- [ ] Image drag-and-drop in Media tab
- [ ] Bulk editing support
- [ ] Admin approval workflow
- [ ] Version history tracking
- [ ] Role-based field visibility

## Related Components

- `ProductFilters`: Companion filtering component
- `Dialog`: Base dialog primitive
- `Tabs`: Base tabs primitive (newly created)
- `ScrollArea`: Scrollable container primitive
- `Button`: Action buttons
- `Badge`: Status indicators

## Support

For questions or issues:
1. Check the Visual Preservation Guide (section 3.3)
2. Review the design system documentation
3. Consult the Team Gamma implementation checklist
4. Review Admin Portal specific requirements

---

**Component Version**: 1.0.0
**Last Updated**: 2025-10-05
**Team**: Hotel (Product Editor Specialists)
**Portal**: Admin
