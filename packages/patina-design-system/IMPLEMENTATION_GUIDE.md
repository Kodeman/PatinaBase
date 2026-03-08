# Patina Design System - Implementation Guide

## Overview

This document provides a comprehensive guide for Team Lima's implementation of the @patina/design-system package. The design system is built as a production-ready, accessible component library that will be used by Designer Portal, Admin Portal, and future Patina applications.

## Project Structure

```
packages/patina-design-system/
├── .storybook/              # Storybook configuration
│   ├── main.ts             # Main Storybook config
│   └── preview.ts          # Preview settings and decorators
├── src/
│   ├── components/         # React components (80+ planned)
│   │   ├── Button/         # Example: Button component
│   │   ├── Layout/         # Box, Container, Stack, Grid, Flex, etc.
│   │   ├── Typography/     # Heading, Text, Label, Code, Link
│   │   ├── Forms/          # Input, Select, Checkbox, Radio, etc.
│   │   ├── Feedback/       # Alert, Toast, Badge, Spinner, etc.
│   │   ├── Overlay/        # Modal, Dialog, Drawer, Tooltip, etc.
│   │   ├── Navigation/     # Tabs, Breadcrumbs, Pagination, etc.
│   │   ├── DataDisplay/    # Table, Card, Avatar, Timeline, etc.
│   │   └── Media/          # Image, Video, Audio, Icon
│   ├── hooks/              # Custom React hooks
│   │   ├── useDisclosure.ts
│   │   ├── useMediaQuery.ts
│   │   ├── useDebounce.ts
│   │   ├── useLocalStorage.ts
│   │   ├── useOnClickOutside.ts
│   │   └── useKeyPress.ts
│   ├── tokens/             # Design tokens
│   │   ├── colors.ts       # Brand, functional, theme colors
│   │   ├── typography.ts   # Font families, sizes, weights
│   │   ├── spacing.ts      # Spacing scale
│   │   ├── shadows.ts      # Elevation system
│   │   ├── borders.ts      # Border radius, widths
│   │   ├── breakpoints.ts  # Responsive breakpoints
│   │   ├── animations.ts   # Durations, easings, keyframes
│   │   └── index.ts        # Token exports
│   ├── utils/              # Utility functions
│   │   ├── cn.ts           # className merger
│   │   ├── format.ts       # Date, currency, number formatting
│   │   ├── validation.ts   # Validation helpers
│   │   └── index.ts
│   ├── styles/             # Global styles
│   │   └── globals.css     # Tailwind base, components, utilities
│   └── index.ts            # Main entry point
├── package.json            # Package configuration
├── tsconfig.json           # TypeScript configuration
├── tsup.config.ts          # Build configuration
├── tailwind.config.ts      # Tailwind configuration
├── vitest.config.ts        # Test configuration
├── vitest.setup.ts         # Test setup
└── README.md               # Documentation
```

## ✅ Completed Infrastructure

### 1. Build & Development Setup

**package.json** - Complete with:
- All necessary dependencies (Radix UI, Tailwind, CVA, etc.)
- Development dependencies (Storybook, Vitest, Testing Library)
- Build scripts for development, testing, and production
- Proper exports configuration for ESM/CJS

**TypeScript Configuration** - Strict mode enabled:
- Target ES2022 with modern features
- React JSX support
- Path aliases (@/* for src imports)
- Declaration files generation

**Build Tools**:
- **tsup**: ESM and CJS bundle generation
- **Tailwind CSS v4**: Modern styling with custom configuration
- **PostCSS**: For processing Tailwind

**Testing Setup**:
- **Vitest**: Unit testing with jsdom environment
- **@testing-library/react**: Component testing
- **vitest-axe**: Accessibility testing
- Coverage reporting configured

**Storybook 8**:
- React Vite integration
- Accessibility addon (@storybook/addon-a11y)
- Essential addons for controls and interactions
- Auto-documentation enabled

### 2. Design Tokens System

Comprehensive token system with full TypeScript support:

#### Colors (`src/tokens/colors.ts`)
- **Brand Colors**: patinaOffWhite, clayBeige, mochaBrown, charcoal
- **Functional Colors**: success, warning, error, info
- **Light Theme**: 25+ semantic color tokens using OKLCH color space
- **Dark Theme**: Complete dark mode palette

#### Typography (`src/tokens/typography.ts`)
- **Font Families**: Playfair Display (headings), Inter (body), JetBrains Mono (code)
- **Font Sizes**: 14 sizes from xs (12px) to 9xl (128px)
- **Font Weights**: 9 weights from thin to black
- **Line Heights**: 6 presets from none to loose
- **Letter Spacing**: 6 presets from tighter to widest
- **Text Styles**: Predefined styles for h1-h6, body, caption, code

#### Spacing (`src/tokens/spacing.ts`)
- **Spacing Scale**: 40+ values based on 4px unit (0.25rem)
- **Container Max Widths**: sm to 3xl
- **Layout Spacing**: Presets for sections, cards, buttons, inputs

#### Shadows (`src/tokens/shadows.ts`)
- **Shadow Scale**: xs to 2xl plus inner shadow
- **Focus Rings**: default, offset, thick variants
- **Elevation Levels**: 0-6 mapping for consistent depth

#### Borders (`src/tokens/borders.ts`)
- **Border Radius**: none to 3xl plus full (pill)
- **Border Widths**: 0, 1px, 2px, 4px, 8px
- **Border Styles**: solid, dashed, dotted, double
- **Presets**: Common configurations for cards, buttons, inputs, modals

#### Breakpoints (`src/tokens/breakpoints.ts`)
- **Breakpoints**: xs (320px) to 3xl (1920px)
- **Media Queries**: Predefined queries for mobile, tablet, desktop
- **Accessibility Queries**: dark mode, reduced motion, touch/mouse

#### Animations (`src/tokens/animations.ts`)
- **Durations**: instant (50ms) to slowest (800ms)
- **Easings**: 11 easing functions including custom cubic-bezier
- **Transitions**: Presets for colors, opacity, shadow, transform
- **Keyframes**: 15+ animation keyframes (fade, slide, scale, spin, pulse, etc.)

### 3. Utilities

**cn() Function** (`src/utils/cn.ts`):
- Combines clsx and tailwind-merge
- Conditional class application
- Proper Tailwind class merging

**Format Utilities** (`src/utils/format.ts`):
- `formatDate()`: Localized date formatting
- `formatCurrency()`: Currency formatting
- `formatPhoneNumber()`: US phone number formatting
- `formatNumber()`: Number with thousand separators
- `formatFileSize()`: Human-readable file sizes
- `truncate()`: Text truncation with ellipsis
- `formatRelativeTime()`: Relative time strings ("2 hours ago")

**Validation Utilities** (`src/utils/validation.ts`):
- `isValidEmail()`: Email validation
- `isValidUrl()`: URL validation
- `isValidPhoneNumber()`: US phone number validation
- `isValidCreditCard()`: Luhn algorithm validation
- `isValidZipCode()`: US ZIP code validation
- `isEmpty()`: Empty string check
- `isInRange()`: Number range validation
- `hasMinLength()` / `hasMaxLength()`: String length validation
- `isAlphanumeric()`: Alphanumeric check
- `isStrongPassword()`: Password strength validation with detailed errors

### 4. React Hooks

**useDisclosure** - Open/close state management:
```tsx
const { isOpen, open, close, toggle } = useDisclosure()
```

**useMediaQuery** - Responsive design:
```tsx
const isMobile = useMediaQuery('(max-width: 768px)')
```

**useDebounce** - Value debouncing:
```tsx
const debouncedValue = useDebounce(value, 500)
```

**useLocalStorage** - localStorage persistence:
```tsx
const [value, setValue, removeValue] = useLocalStorage('key', initialValue)
```

**useOnClickOutside** - Outside click detection:
```tsx
useOnClickOutside(ref, () => setIsOpen(false))
```

**useKeyPress** - Keyboard shortcut detection:
```tsx
const escapePressed = useKeyPress('Escape')
```

### 5. Global Styles

**globals.css** includes:
- Tailwind base, components, and utilities layers
- CSS custom properties for all theme colors
- Light and dark mode support
- Typography defaults (Playfair Display for headings, Inter for body)
- Focus-visible styles with ring and offset
- Smooth transitions on interactive elements
- Custom scrollbar styling
- Selection styles
- Custom animation keyframes

## 📋 Component Implementation Plan

### Phase 1: Foundation (Week 1)

#### Layout Components
- [ ] **Box** - Polymorphic container with styling props
- [ ] **Container** - Centered max-width container
- [ ] **Stack** - Vertical/horizontal stacking (VStack/HStack)
- [ ] **Grid** - CSS Grid wrapper
- [ ] **Flex** - Flexbox wrapper
- [ ] **Spacer** - Flexible spacing element
- [ ] **Divider** - Horizontal/vertical separator

#### Typography Components
- [ ] **Heading** - h1-h6 with variants
- [ ] **Text** - Paragraph text with sizes
- [ ] **Label** - Form label with required indicator
- [ ] **Code** - Inline and block code
- [ ] **Link** - Styled anchor with external link variant

### Phase 2: Forms & Inputs (Week 2)

#### Basic Inputs
- [ ] **Input** - Text input with variants and sizes
- [ ] **Textarea** - Multi-line text input with auto-resize
- [ ] **Label** - Enhanced form label
- [ ] **FormField** - Complete field with label, input, error, help text
- [ ] **FormGroup** - Group related fields

#### Selection Controls
- [ ] **Checkbox** - Checkbox with indeterminate state
- [ ] **Radio** - Radio button group
- [ ] **Switch** - Toggle switch
- [ ] **Select** - Dropdown select with search
- [ ] **Combobox** - Autocomplete select

#### Advanced Inputs
- [ ] **DatePicker** - Date selection with calendar
- [ ] **TimePicker** - Time selection
- [ ] **DateRangePicker** - Date range selection
- [ ] **ColorPicker** - Color selection with swatches
- [ ] **Slider** - Single value slider
- [ ] **RangeSlider** - Min/max range slider
- [ ] **FileInput** - File upload with drag-and-drop

### Phase 3: Buttons & Actions (Week 1)

- [ ] **Button** - Primary button (already started)
- [ ] **IconButton** - Square icon button
- [ ] **ButtonGroup** - Group buttons together
- [ ] **SplitButton** - Button with dropdown menu
- [ ] **ToggleButton** - Toggle button
- [ ] **ToggleGroup** - Mutually exclusive toggles

### Phase 4: Feedback (Week 2)

- [ ] **Alert** - Info, success, warning, error alerts
- [ ] **Toast** - Temporary notifications with ToastProvider
- [ ] **Badge** - Status badge with variants
- [ ] **Tag** - Dismissible tag
- [ ] **Spinner** - Loading spinner with sizes
- [ ] **Skeleton** - Loading skeleton
- [ ] **ProgressBar** - Determinate/indeterminate progress
- [ ] **CircularProgress** - Circular progress indicator
- [ ] **EmptyState** - Empty state placeholder
- [ ] **ErrorBoundary** - Error boundary component

### Phase 5: Overlays (Week 2)

- [ ] **Modal** - Centered modal dialog
- [ ] **Dialog** - Alert/confirm dialog
- [ ] **Drawer** - Slide-out panel (left/right/top/bottom)
- [ ] **Sheet** - Bottom sheet
- [ ] **Tooltip** - Hover tooltip
- [ ] **Popover** - Popover content
- [ ] **ContextMenu** - Right-click menu
- [ ] **DropdownMenu** - Dropdown menu
- [ ] **HoverCard** - Hover card

### Phase 6: Navigation (Week 1)

- [ ] **Tabs** - Tabbed interface
- [ ] **Breadcrumbs** - Breadcrumb navigation
- [ ] **Pagination** - Page navigation with sizes
- [ ] **Stepper** - Multi-step flow indicator
- [ ] **Menu** - Navigation menu
- [ ] **Sidebar** - App sidebar navigation

### Phase 7: Data Display (Week 2)

- [ ] **Table** - Data table with sorting, filtering, pagination
- [ ] **Card** - Content card with variants
- [ ] **CardGrid** - Responsive card grid
- [ ] **Avatar** - User avatar with fallback
- [ ] **AvatarGroup** - Multiple avatars with overflow
- [ ] **Stat** - Metric display with trend
- [ ] **Timeline** - Event timeline
- [ ] **Tree** - Hierarchical tree view
- [ ] **Accordion** - Collapsible accordion
- [ ] **List** - Ordered/unordered lists
- [ ] **Description** List - Key-value pairs

### Phase 8: Media (Week 1)

- [ ] **Image** - Optimized image with lazy loading
- [ ] **ImageGallery** - Image gallery with thumbnails
- [ ] **ImageLightbox** - Full-screen image viewer
- [ ] **Video** - Video player
- [ ] **AudioPlayer** - Audio player
- [ ] **Icon** - SVG icon system (Lucide React)

## 🎨 Component Implementation Standards

### Every Component Must Include:

1. **TypeScript Types**
   - Full type definitions for all props
   - Extend HTML element types when applicable
   - Export prop types for consumer use

2. **Accessibility**
   - ARIA attributes (role, aria-label, aria-describedby, etc.)
   - Keyboard navigation support
   - Focus management
   - Screen reader compatibility
   - Color contrast compliance (WCAG AA)

3. **Variants & Sizes**
   - Use Class Variance Authority (CVA)
   - Common variants: default, primary, secondary, destructive, ghost, outline
   - Common sizes: sm, md (default), lg

4. **Composition**
   - Compound components where appropriate
   - Slots for customization (using Radix Slot)
   - Forward refs for DOM access

5. **Testing**
   - Unit tests with Vitest
   - Accessibility tests with vitest-axe
   - Interaction tests with Testing Library
   - Minimum 80% code coverage

6. **Documentation**
   - Storybook story with all variants
   - Interactive controls for props
   - Code examples
   - Accessibility notes
   - API documentation

### Example Component Structure:

```tsx
// src/components/ComponentName/ComponentName.tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const componentVariants = cva(
  'base classes',
  {
    variants: {
      variant: {
        default: 'variant classes',
        // ... more variants
      },
      size: {
        sm: 'size classes',
        md: 'size classes',
        lg: 'size classes',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface ComponentNameProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof componentVariants> {
  // Additional props
}

const ComponentName = React.forwardRef<HTMLDivElement, ComponentNameProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(componentVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
ComponentName.displayName = 'ComponentName'

export { ComponentName, componentVariants }
```

## 🧪 Testing Strategy

### Unit Tests
```tsx
// src/components/ComponentName/ComponentName.test.tsx
import { render, screen } from '@testing-library/react'
import { ComponentName } from './ComponentName'

describe('ComponentName', () => {
  it('renders children', () => {
    render(<ComponentName>Test</ComponentName>)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('applies variant classes', () => {
    render(<ComponentName variant="primary">Test</ComponentName>)
    // assertions
  })
})
```

### Accessibility Tests
```tsx
import { axe } from 'vitest-axe'

it('has no accessibility violations', async () => {
  const { container } = render(<ComponentName>Test</ComponentName>)
  expect(await axe(container)).toHaveNoViolations()
})
```

## 📖 Storybook Stories

```tsx
// src/components/ComponentName/ComponentName.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ComponentName } from './ComponentName'

const meta = {
  title: 'Components/ComponentName',
  component: ComponentName,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary'],
    },
  },
} satisfies Meta<typeof ComponentName>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'ComponentName',
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-4">
      <ComponentName variant="default">Default</ComponentName>
      <ComponentName variant="primary">Primary</ComponentName>
      <ComponentName variant="secondary">Secondary</ComponentName>
    </div>
  ),
}
```

## 🚀 Getting Started

### Install Dependencies
```bash
cd packages/patina-design-system
pnpm install
```

### Development Workflow
```bash
# Start Storybook for component development
pnpm storybook

# Run tests in watch mode
pnpm test:watch

# Build the package
pnpm build

# Type checking
pnpm type-check
```

## 📦 Package Usage

### In Other Packages

```json
// package.json
{
  "dependencies": {
    "@patina/design-system": "workspace:*"
  }
}
```

```tsx
// Import styles (once in app root)
import '@patina/design-system/styles/globals.css'

// Import components
import { Button, Card, Heading } from '@patina/design-system'

// Import tokens
import { colors, spacing } from '@patina/design-system/tokens'

// Import hooks
import { useDisclosure, useMediaQuery } from '@patina/design-system'
```

## 🎯 Success Criteria

- [ ] 80+ components implemented
- [ ] 80%+ test coverage
- [ ] All components have Storybook stories
- [ ] Zero accessibility violations
- [ ] Complete TypeScript types
- [ ] Comprehensive documentation
- [ ] Tree-shakeable build output
- [ ] Works in Designer Portal
- [ ] Works in Admin Portal

## 📝 Notes

- Use Radix UI primitives for complex interactive components (Dialog, Popover, Select, etc.)
- All colors use OKLCH color space for perceptual uniformity
- Components should be composable and follow React best practices
- Prioritize accessibility - keyboard navigation, screen readers, ARIA attributes
- Keep bundle size minimal - tree-shakeable, no unnecessary dependencies
- Document breaking changes for consumers

## 🔗 Resources

- [Radix UI Documentation](https://www.radix-ui.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [Class Variance Authority](https://cva.style/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
