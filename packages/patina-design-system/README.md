# @patina/design-system

Comprehensive, accessible React component library for Patina applications. Built with TypeScript, Tailwind CSS, and Radix UI primitives.

## Features

- **80+ Production-Ready Components** - Complete component library for building modern web applications
- **Fully Accessible (WCAG AA)** - Built with accessibility as a first-class concern
- **Type-Safe** - Full TypeScript support with strict mode
- **Themeable** - Comprehensive design token system with light/dark modes
- **Tree-Shakeable** - Optimized bundle size with ESM/CJS support
- **Well-Documented** - Storybook stories and API documentation for every component
- **Tested** - Comprehensive test coverage with unit, accessibility, and visual regression tests

## Installation

```bash
pnpm add @patina/design-system
```

## Quick Start

### 1. Import Styles

Import the global stylesheet at your app entry point:

```tsx
// app/layout.tsx or _app.tsx
import '@patina/design-system/styles/globals.css'
```

### 2. Use Components

```tsx
import { Button, Card, Heading, Text } from '@patina/design-system'

export function Example() {
  return (
    <Card>
      <Heading level={2}>Welcome to Patina</Heading>
      <Text>Build beautiful, accessible interfaces.</Text>
      <Button variant="primary">Get Started</Button>
    </Card>
  )
}
```

### 3. Use Design Tokens

```tsx
import { tokens, colors, typography } from '@patina/design-system/tokens'

// Access individual tokens
const primaryColor = colors.light.primary
const headingFont = typography.fontFamilies.heading

// Or use the complete token set
const { spacing, shadows, borderRadius } = tokens
```

### 4. Use Hooks

```tsx
import { useDisclosure, useMediaQuery, useDebounce } from '@patina/design-system'

function ResponsiveComponent() {
  const { isOpen, open, close } = useDisclosure()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 300)

  return (
    // Your component
  )
}
```

## Component Categories

### Layout Components
- **Box** - Flexible container with styling props
- **Container** - Centered content container with max-width
- **Stack** - Vertical/horizontal stacking with spacing
- **Grid** - CSS Grid layout
- **Flex** - Flexbox layout
- **Spacer** - Add spacing between elements
- **Divider** - Horizontal/vertical divider

### Typography
- **Heading** - h1-h6 heading elements
- **Text** - Body text with variants
- **Label** - Form labels
- **Code** - Inline/block code display
- **Link** - Styled anchor tags

### Buttons
- **Button** - Primary button with variants (default, destructive, outline, secondary, ghost, link)
- **IconButton** - Square button for icons
- **ButtonGroup** - Group related buttons
- **SplitButton** - Button with dropdown

### Forms
- **Input** - Text input field
- **Textarea** - Multi-line text input
- **Select** - Dropdown select
- **Checkbox** - Checkbox input
- **Radio** - Radio button
- **Switch** - Toggle switch
- **FormField** - Complete form field with label, input, error, help text
- **FormGroup** - Group related form fields
- **DatePicker** - Date selection
- **TimePicker** - Time selection
- **ColorPicker** - Color selection
- **Slider** - Range slider
- **FileInput** - File upload with drag-and-drop

### Feedback
- **Alert** - Info, success, warning, error alerts
- **Toast** - Temporary notification
- **Badge** - Status badge
- **Tag** - Content tag
- **Spinner** - Loading spinner
- **Skeleton** - Loading skeleton
- **ProgressBar** - Progress indicator
- **EmptyState** - Empty state placeholder
- **ErrorBoundary** - Error boundary wrapper

### Overlay
- **Modal** - Modal dialog
- **Dialog** - Alert/confirm dialog
- **Drawer** - Slide-out panel
- **Tooltip** - Hover tooltip
- **Popover** - Popover content
- **ContextMenu** - Right-click menu
- **DropdownMenu** - Dropdown menu
- **Sheet** - Bottom sheet

### Navigation
- **Tabs** - Tabbed interface
- **Breadcrumbs** - Breadcrumb navigation
- **Pagination** - Page navigation
- **Stepper** - Multi-step flow indicator

### Data Display
- **Table** - Data table with sorting, filtering, pagination
- **Card** - Content card
- **CardGrid** - Grid of cards
- **Avatar** - User avatar
- **AvatarGroup** - Multiple avatars
- **Stat** - Metric display
- **Timeline** - Event timeline
- **Tree** - Hierarchical tree view

### Media
- **Image** - Optimized image with lazy loading
- **ImageGallery** - Image gallery
- **ImageLightbox** - Full-screen image viewer
- **Video** - Video player
- **AudioPlayer** - Audio player
- **Icon** - SVG icon system

## Design Tokens

The design system includes a comprehensive token system:

### Colors
```tsx
import { colors } from '@patina/design-system/tokens'

// Brand colors
colors.brand.clayBeige
colors.brand.mochaBrown

// Functional colors
colors.functional.success
colors.functional.error

// Theme colors (light/dark)
colors.light.primary
colors.dark.primary
```

### Typography
```tsx
import { typography } from '@patina/design-system/tokens'

typography.fontFamilies.heading // Playfair Display
typography.fontFamilies.body // Inter
typography.fontSizes.xl
typography.fontWeights.bold
typography.lineHeights.normal
```

### Spacing
```tsx
import { spacing } from '@patina/design-system/tokens'

spacing[4] // 1rem (16px)
spacing[8] // 2rem (32px)
```

### Shadows, Borders, Animations
```tsx
import { shadows, borderRadius, animations } from '@patina/design-system/tokens'

shadows.md
borderRadius.lg
animations.durations.normal
animations.easings.standard
```

## Hooks

### useDisclosure
Manage open/close state for modals, dropdowns, etc.

```tsx
const { isOpen, open, close, toggle } = useDisclosure()
```

### useMediaQuery
Responsive design with media queries

```tsx
const isMobile = useMediaQuery('(max-width: 768px)')
```

### useDebounce
Debounce values for search inputs, etc.

```tsx
const debouncedValue = useDebounce(value, 500)
```

### useLocalStorage
Persist state to localStorage

```tsx
const [value, setValue, removeValue] = useLocalStorage('key', initialValue)
```

### useOnClickOutside
Detect clicks outside an element

```tsx
useOnClickOutside(ref, () => setIsOpen(false))
```

### useKeyPress
Detect keyboard shortcuts

```tsx
const escapePressed = useKeyPress('Escape')
```

## Accessibility

All components follow WCAG 2.1 AA standards:

- **Keyboard Navigation** - Full keyboard support (Tab, Arrow keys, Esc, Enter)
- **Screen Readers** - Proper ARIA attributes and labels
- **Focus Management** - Focus trapping in modals, focus return
- **Color Contrast** - All text meets AA contrast ratios
- **Focus Indicators** - Clear focus visible states

## Development

### Run Storybook
```bash
pnpm storybook
```

### Run Tests
```bash
pnpm test
pnpm test:coverage
```

### Build
```bash
pnpm build
```

### Type Check
```bash
pnpm type-check
```

## Contributing

See the main Patina repository for contribution guidelines.

## License

Proprietary - Patina Platform
