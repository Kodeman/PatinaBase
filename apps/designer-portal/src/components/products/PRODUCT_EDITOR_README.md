# Product Editor Modal Component

## Overview

The Product Editor Modal is a comprehensive, tabbed interface for editing product information. It follows the Visual Preservation Guide (section 3.3) specifications to ensure brand consistency and optimal user experience.

## Component Location

```
/home/middle/patina/apps/designer-portal/src/components/products/product-editor-modal.tsx
```

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

function ProductCatalog() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();

  const handleSave = async (product: Product) => {
    // Save logic here
    await updateProduct(product);
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

### Controlled Tab State

```tsx
import { ProductEditorModal } from '@/components/products/product-editor-modal';
import { useState } from 'react';

function AdvancedProductEditor() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [product, setProduct] = useState<Product>();

  const handleSave = async (product: Product) => {
    await api.saveProduct(product);
  };

  const handleTabChange = (tab: string) => {
    // Track analytics or validate before changing
    analytics.track('tab_change', { tab });
    setActiveTab(tab);
  };

  return (
    <ProductEditorModal
      open={isOpen}
      onOpenChange={setIsOpen}
      product={product}
      onSave={handleSave}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    />
  );
}
```

### Creating New Product

```tsx
import { ProductEditorModal } from '@/components/products/product-editor-modal';

function CreateProduct() {
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = async (product: Product) => {
    // Create new product
    await api.createProduct(product);
    setIsOpen(false);
  };

  return (
    <ProductEditorModal
      open={isOpen}
      onOpenChange={setIsOpen}
      // No product prop = new product mode
      onSave={handleSave}
    />
  );
}
```

## Tab Configuration

The component uses a `tabConfig` array to define tabs. To add or modify tabs:

```typescript
const tabConfig: TabConfig[] = [
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'seo', label: 'SEO', icon: SearchIcon },
  // Add more tabs here
];
```

## Implementing Tab Content

Currently, the component uses `TabPlaceholder` for demonstration. Replace this with actual tab panel components:

### Example: Details Tab Component

```tsx
// components/products/tabs/details-tab.tsx
interface DetailsTabProps {
  product?: Product;
  onChange: (updates: Partial<Product>) => void;
}

export function DetailsTab({ product, onChange }: DetailsTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="name">Product Name</Label>
        <Input
          id="name"
          value={product?.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={product?.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      {/* More fields... */}
    </div>
  );
}
```

### Integrating Custom Tab Content

Update the `TabsContent` section in the modal:

```tsx
<TabsContent value="details" className="h-full m-0">
  <ScrollArea className="h-full">
    <div className="p-6">
      <DetailsTab product={product} onChange={handleProductUpdate} />
    </div>
  </ScrollArea>
</TabsContent>
```

## Styling Specifications

### Design Tokens Used
- `bg-muted`: Thumbnail background, tab list
- `border-border`: Separators
- `text-muted-foreground`: Secondary text
- `transition-all duration-200`: All interactive elements

### Responsive Breakpoints
- Mobile: Default styles
- Desktop (md): `md:w-12 md:h-12`, `md:grid md:grid-cols-5`

### Focus States
All interactive elements inherit clay-colored focus outlines from global styles:
- Focus ring with 2px offset
- 200ms transition timing
- Keyboard navigation supported

## Accessibility Features

- **Keyboard Navigation**: Tab through all controls
- **ESC Key**: Closes modal
- **Focus Management**: Proper tab order
- **ARIA Labels**: Semantic HTML structure
- **Screen Reader Support**: All icons have text labels

## State Management

### Internal State
- `internalTab`: Tracks active tab (uncontrolled mode)
- `saveState`: Tracks save operation status
- `hasChanges`: Indicates unsaved changes

### External State
Components consuming this modal should manage:
- Product data
- Save operation
- Modal open/close state
- Optional: active tab (for controlled behavior)

## Integration with Auto-Save

For auto-save functionality:

```tsx
import { ProductEditorModal } from '@/components/products/product-editor-modal';
import { useAutoSave } from '@/hooks/use-auto-save';

function ProductEditorWithAutoSave() {
  const [product, setProduct] = useState<Product>();
  const { saveState } = useAutoSave(product, async (data) => {
    await api.updateProduct(data);
  });

  return (
    <ProductEditorModal
      open={isOpen}
      onOpenChange={setIsOpen}
      product={product}
      onSave={async (updated) => {
        setProduct(updated);
      }}
    />
  );
}
```

## Performance Considerations

- **Lazy Loading**: Consider code-splitting tab panels
- **Memoization**: Tab content should use `React.memo` for large forms
- **Debouncing**: Implement debounced auto-save to reduce API calls
- **Virtual Scrolling**: For long lists within tabs

## Testing

### Unit Tests
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductEditorModal } from './product-editor-modal';

describe('ProductEditorModal', () => {
  it('displays product name in header', () => {
    const product = { name: 'Test Product', id: '123' };
    render(
      <ProductEditorModal
        open={true}
        onOpenChange={() => {}}
        product={product}
        onSave={async () => {}}
      />
    );
    expect(screen.getByText('Test Product')).toBeInTheDocument();
  });

  it('navigates between tabs', () => {
    render(
      <ProductEditorModal
        open={true}
        onOpenChange={() => {}}
        onSave={async () => {}}
      />
    );

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
  });
});
```

## Future Enhancements

- [ ] Implement actual tab panel forms
- [ ] Add validation error display
- [ ] Implement auto-save functionality
- [ ] Add unsaved changes warning
- [ ] Support for draft/preview modes
- [ ] Keyboard shortcuts for tab navigation
- [ ] Image drag-and-drop in Media tab
- [ ] Bulk editing support

## Related Components

- `ProductFilters`: Companion filtering component
- `Dialog`: Base dialog primitive
- `Tabs`: Base tabs primitive
- `ScrollArea`: Scrollable container primitive
- `Button`: Action buttons
- `Badge`: Status indicators

## Support

For questions or issues:
1. Check the Visual Preservation Guide (section 3.3)
2. Review the design system documentation
3. Consult the Team Gamma implementation checklist

---

**Component Version**: 1.0.0
**Last Updated**: 2025-10-05
**Team**: Hotel (Product Editor Specialists)
