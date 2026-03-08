# Command

A composable command menu component built with cmdk and Patina design tokens. Perfect for command palettes, search interfaces, and filterable lists.

## Features

- Fast fuzzy search with cmdk
- Keyboard-first navigation
- Checkbox-like items for multi-select (perfect for filters)
- Command dialog with keyboard shortcut support (⌘K)
- Multiple groups with separators
- Icon and shortcut support
- Customizable variants and styling
- OKLCH color system integration

## Installation

This component is part of the `@patina/design-system` package.

```bash
npm install @patina/design-system
```

## Usage

### Basic Command Menu

```tsx
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@patina/design-system'

function Example() {
  return (
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>Calendar</CommandItem>
          <CommandItem>Search Emoji</CommandItem>
          <CommandItem>Calculator</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
```

### With Checkbox Items (Filter Pattern)

Perfect for product catalog filters:

```tsx
import { CommandCheckboxItem } from '@patina/design-system'

function ProductFilters() {
  const [selected, setSelected] = useState<string[]>([])

  const toggleCategory = (category: string) => {
    setSelected(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  return (
    <Command>
      <CommandInput placeholder="Search categories..." />
      <CommandList>
        <CommandGroup heading="Filter by Category">
          <CommandCheckboxItem
            checked={selected.includes('electronics')}
            onCheckedChange={() => toggleCategory('electronics')}
          >
            Electronics
          </CommandCheckboxItem>
          <CommandCheckboxItem
            checked={selected.includes('clothing')}
            onCheckedChange={() => toggleCategory('clothing')}
          >
            Clothing
          </CommandCheckboxItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
```

### Command Dialog (⌘K Pattern)

```tsx
import { CommandDialog } from '@patina/design-system'

function App() {
  const [open, setOpen] = useState(false)

  // Opens on ⌘K or Ctrl+K
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem>New Document</CommandItem>
          <CommandItem>Open File</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

### With Icons and Shortcuts

```tsx
import { Calendar, Settings } from 'lucide-react'
import { CommandShortcut } from '@patina/design-system'

<Command>
  <CommandInput placeholder="Search..." />
  <CommandList>
    <CommandGroup heading="Quick Actions">
      <CommandItem>
        <Calendar className="mr-2 h-4 w-4" />
        <span>Calendar</span>
        <CommandShortcut>⌘C</CommandShortcut>
      </CommandItem>
      <CommandItem>
        <Settings className="mr-2 h-4 w-4" />
        <span>Settings</span>
        <CommandShortcut>⌘S</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  </CommandList>
</Command>
```

### Multiple Groups with Separators

```tsx
import { CommandSeparator } from '@patina/design-system'

<Command>
  <CommandInput placeholder="Search..." />
  <CommandList>
    <CommandGroup heading="Navigation">
      <CommandItem>Dashboard</CommandItem>
      <CommandItem>Products</CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="Settings">
      <CommandItem>Profile</CommandItem>
      <CommandItem>Preferences</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>
```

## Components

### Command

Root command component.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'ghost'` | `'default'` | Visual variant |
| `className` | `string` | - | Additional CSS classes |

Plus all props from cmdk Command component.

### CommandInput

Search input for filtering commands.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showIcon` | `boolean` | `true` | Show search icon |
| `placeholder` | `string` | - | Input placeholder text |
| `className` | `string` | - | Additional CSS classes |

### CommandList

Scrollable list container for command items.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | - | Additional CSS classes |

Default max height: `300px`

### CommandEmpty

Shown when no results match the search.

```tsx
<CommandEmpty>No results found.</CommandEmpty>
```

### CommandGroup

Groups related commands with optional heading.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `heading` | `string` | - | Group heading text |
| `className` | `string` | - | Additional CSS classes |

### CommandItem

Individual selectable command item.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `selected` | `boolean` | `false` | Show selected indicator |
| `icon` | `ReactNode` | - | Icon element |
| `onSelect` | `() => void` | - | Selection callback |
| `className` | `string` | - | Additional CSS classes |

### CommandCheckboxItem

Command item with checkbox-like behavior.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `checked` | `boolean` | `false` | Whether item is checked |
| `onCheckedChange` | `(checked: boolean) => void` | - | Callback when checked state changes |
| `icon` | `ReactNode` | - | Icon element |
| `className` | `string` | - | Additional CSS classes |

### CommandSeparator

Visual separator between groups.

```tsx
<CommandSeparator />
```

### CommandShortcut

Display keyboard shortcut hint.

```tsx
<CommandShortcut>⌘K</CommandShortcut>
```

### CommandDialog

Full-screen command palette dialog.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | `false` | Whether dialog is open |
| `onOpenChange` | `(open: boolean) => void` | - | Callback when open state changes |

Automatically responds to ⌘K (Mac) or Ctrl+K (Windows/Linux).

## Variants

### Command Variants

- **default**: With border and shadow
- **ghost**: Borderless, inline style

## Use Cases

### Product Catalog Filters

The checkbox items are perfect for the Product Filters component:

```tsx
<Command>
  <CommandInput placeholder="Search vendors..." />
  <CommandList>
    <CommandGroup heading="Select Vendors">
      {vendors.map(vendor => (
        <CommandCheckboxItem
          key={vendor}
          checked={selected.includes(vendor)}
          onCheckedChange={() => toggleVendor(vendor)}
        >
          {vendor}
        </CommandCheckboxItem>
      ))}
    </CommandGroup>
  </CommandList>
</Command>
```

### Command Palette

Quick navigation and actions:

```tsx
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Quick actions..." />
  <CommandList>
    <CommandGroup heading="Navigation">
      <CommandItem onSelect={() => navigate('/dashboard')}>
        Dashboard
      </CommandItem>
      <CommandItem onSelect={() => navigate('/products')}>
        Products
      </CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

### Searchable Select

Single-select dropdown alternative:

```tsx
<Command>
  <CommandInput placeholder="Select a category..." />
  <CommandList>
    <CommandEmpty>No category found.</CommandEmpty>
    <CommandGroup>
      {categories.map(cat => (
        <CommandItem
          key={cat}
          selected={selected === cat}
          onSelect={() => setSelected(cat)}
        >
          {cat}
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
</Command>
```

## Keyboard Navigation

- **↑/↓**: Navigate items
- **Enter**: Select item
- **Escape**: Close dialog (in CommandDialog)
- **⌘K** or **Ctrl+K**: Toggle dialog (in CommandDialog)
- **Type**: Filter items by fuzzy search

## Accessibility

- Full keyboard navigation
- Proper ARIA attributes from cmdk
- Screen reader support
- Focus management
- Respects reduced motion

## Design Tokens

Uses the following Patina design tokens:

- `--popover` / `--popover-foreground`
- `--border`
- `--muted` / `--muted-foreground`
- `--accent` / `--accent-foreground`
- `--primary`

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Supports both light and dark themes

## Related Components

- [Select](../Select) - Traditional select dropdown
- [Popover](../Popover) - Can wrap Command for dropdowns
- [Dialog](../Dialog) - Alternative full-screen modal
- [SearchInput](../SearchInput) - Standalone search input
