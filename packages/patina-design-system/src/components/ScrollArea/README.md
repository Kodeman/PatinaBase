# ScrollArea

A custom-styled scrollable area component built on Radix UI Scroll Area with Patina design tokens.

## Features

- Custom scrollbar styling matching Patina design system
- Support for vertical, horizontal, or both scroll directions
- Multiple size variants (sm, md, lg, full)
- Minimal scrollbar variant for subtle scrolling
- Smooth transitions and hover effects
- Full keyboard navigation support
- OKLCH color system integration

## Installation

This component is part of the `@patina/design-system` package.

```bash
npm install @patina/design-system
```

## Usage

### Basic Example

```tsx
import { ScrollArea } from '@patina/design-system'

function Example() {
  return (
    <ScrollArea className="h-72 w-96 rounded-md border">
      <div className="p-4">
        {/* Your scrollable content */}
      </div>
    </ScrollArea>
  )
}
```

### Vertical Scroll

```tsx
<ScrollArea size="lg" orientation="vertical" className="w-96">
  <div className="p-4">
    {/* Long vertical content */}
  </div>
</ScrollArea>
```

### Horizontal Scroll

```tsx
<ScrollArea orientation="horizontal" className="w-full">
  <div className="flex gap-4 w-max p-4">
    {/* Wide horizontal content */}
  </div>
</ScrollArea>
```

### Both Directions

```tsx
<ScrollArea orientation="both" size="lg">
  <div className="w-[800px] p-4">
    {/* Content that scrolls both ways */}
  </div>
</ScrollArea>
```

### Minimal Scrollbar

```tsx
<ScrollArea
  size="md"
  orientation="vertical"
  scrollbarVariant="minimal"
  className="h-64"
>
  <div className="p-4">
    {/* Content with subtle scrollbar */}
  </div>
</ScrollArea>
```

## Props

### ScrollArea

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `'sm' \| 'md' \| 'lg' \| 'full'` | `'md'` | Maximum height of the scroll area |
| `orientation` | `'vertical' \| 'horizontal' \| 'both'` | `'vertical'` | Scroll direction(s) |
| `scrollbarVariant` | `'default' \| 'minimal'` | `'default'` | Scrollbar visual style |
| `className` | `string` | - | Additional CSS classes |

Plus all props from Radix UI ScrollArea.Root

### ScrollBar

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | Scrollbar orientation |
| `variant` | `'default' \| 'minimal'` | `'default'` | Scrollbar visual style |
| `className` | `string` | - | Additional CSS classes |

## Size Variants

- **sm**: `max-h-64` (16rem / 256px)
- **md**: `max-h-96` (24rem / 384px)
- **lg**: `max-h-[32rem]` (512px)
- **full**: `h-full` (fills parent container)

## Scrollbar Variants

- **default**: Standard scrollbar with `w-2.5` and full opacity on hover
- **minimal**: Subtle scrollbar with `w-1.5` and reduced opacity

## Use Cases

### Product Editor

Perfect for tabbed content panels with long forms:

```tsx
<ScrollArea size="lg" className="p-4">
  <ProductForm />
</ScrollArea>
```

### Sidebar Navigation

Scrollable navigation lists:

```tsx
<ScrollArea size="full" scrollbarVariant="minimal">
  <nav>
    {menuItems.map(item => <NavItem key={item.id} {...item} />)}
  </nav>
</ScrollArea>
```

### Product Catalog

Horizontal image galleries:

```tsx
<ScrollArea orientation="horizontal">
  <div className="flex gap-4 p-4">
    {images.map(img => <ProductImage key={img.id} {...img} />)}
  </div>
</ScrollArea>
```

## Accessibility

- Full keyboard navigation support
- Screen reader compatible
- Respects reduced motion preferences
- Proper ARIA attributes from Radix UI

## Design Tokens

The component uses the following Patina design tokens:

- `--muted` - Scrollbar track background
- `--muted-foreground` - Scrollbar thumb color
- Border radius from global theme

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Supports both light and dark themes

## Related Components

- [Tabs](../Tabs) - Often used together for tabbed interfaces
- [Dialog](../Dialog) - Dialogs with scrollable content
- [Popover](../Popover) - Popovers with scrollable lists
