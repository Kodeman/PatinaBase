# Patina Design System - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### 1. Install Dependencies
```bash
cd packages/patina-design-system
pnpm install
```

### 2. Start Storybook
```bash
pnpm storybook
```
Storybook will open at http://localhost:6006

### 3. Run Tests
```bash
pnpm test
```

### 4. Build Package
```bash
pnpm build
```

## 📁 Project Structure

```
patina-design-system/
├── .storybook/          # Storybook 8 configuration
├── src/
│   ├── components/      # React components (Button example included)
│   ├── hooks/           # 6 React hooks (useDisclosure, useMediaQuery, etc.)
│   ├── tokens/          # 200+ design tokens (colors, typography, spacing, etc.)
│   ├── utils/           # 19 utility functions (cn, format, validation)
│   ├── styles/          # Global CSS with Tailwind
│   └── index.ts         # Main entry point
├── package.json         # Complete with all dependencies
├── tsconfig.json        # TypeScript strict mode
├── tsup.config.ts       # ESM/CJS build config
├── tailwind.config.ts   # Tailwind with Patina theme
├── vitest.config.ts     # Test configuration
└── README.md            # Full documentation
```

## 🎨 Using Design Tokens

```tsx
import { colors, typography, spacing } from '@patina/design-system/tokens'

// Brand colors
const primary = colors.brand.clayBeige

// Typography
const headingFont = typography.fontFamilies.heading // Playfair Display
const bodySize = typography.fontSizes.base // 1rem

// Spacing
const padding = spacing[4] // 1rem (16px)
```

## 🪝 Using Hooks

```tsx
import { useDisclosure, useMediaQuery, useDebounce } from '@patina/design-system'

function MyComponent() {
  // Modal state
  const { isOpen, open, close } = useDisclosure()

  // Responsive
  const isMobile = useMediaQuery('(max-width: 768px)')

  // Debounce search
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  return (...)
}
```

## 🧩 Using Components

```tsx
import { Button } from '@patina/design-system'

function MyApp() {
  return (
    <Button variant="default" size="lg" onClick={handleClick}>
      Click Me
    </Button>
  )
}
```

## 🛠️ Development Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start build in watch mode |
| `pnpm build` | Build for production |
| `pnpm test` | Run tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm storybook` | Start Storybook dev server |
| `pnpm storybook:build` | Build Storybook for deployment |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix ESLint issues |

## 📦 Available Exports

### Main Package
```tsx
import {
  // Components
  Button,

  // Hooks
  useDisclosure,
  useMediaQuery,
  useDebounce,
  useLocalStorage,
  useOnClickOutside,
  useKeyPress,

  // Utils
  cn,
  formatDate,
  formatCurrency,
  isValidEmail,
} from '@patina/design-system'
```

### Design Tokens
```tsx
import {
  colors,
  typography,
  spacing,
  shadows,
  borderRadius,
  animations,
  breakpoints,
  tokens, // All tokens
} from '@patina/design-system/tokens'
```

### Styles
```tsx
import '@patina/design-system/styles/globals.css'
```

## 🎯 Next Steps: Component Implementation

### Phase 1: Layout Components (Priority 1)
Create these components first as they're foundational:
- [ ] Box - Polymorphic container
- [ ] Container - Max-width centered container
- [ ] Stack - Vertical/horizontal stacking
- [ ] Grid - CSS Grid wrapper
- [ ] Flex - Flexbox wrapper
- [ ] Spacer - Flexible spacing
- [ ] Divider - Separator line

### Component Template

```tsx
// src/components/ComponentName/ComponentName.tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const componentVariants = cva(
  'base-classes',
  {
    variants: {
      variant: {
        default: 'variant-classes',
      },
      size: {
        md: 'size-classes',
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
    VariantProps<typeof componentVariants> {}

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

### Test Template

```tsx
// src/components/ComponentName/ComponentName.test.tsx
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ComponentName } from './ComponentName'

describe('ComponentName', () => {
  it('renders children', () => {
    render(<ComponentName>Test</ComponentName>)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ComponentName>Test</ComponentName>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

### Storybook Template

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
} satisfies Meta<typeof ComponentName>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'ComponentName',
  },
}
```

## 📚 Resources

- **Full README**: `/home/middle/patina/packages/patina-design-system/README.md`
- **Implementation Guide**: `/home/middle/patina/packages/patina-design-system/IMPLEMENTATION_GUIDE.md`
- **Delivery Report**: `/home/middle/patina/DESIGN_SYSTEM_FOUNDATION_REPORT.md`

## 🤝 Team Collaboration

### Working on Components
1. Pick a component from the roadmap
2. Create component folder in `src/components/`
3. Implement component with TypeScript
4. Write tests (aim for 80%+ coverage)
5. Create Storybook story
6. Update exports in `src/components/index.ts`
7. Run tests and type-check before committing

### Code Review Checklist
- [ ] TypeScript types complete
- [ ] Accessibility attributes (ARIA)
- [ ] Keyboard navigation works
- [ ] Tests pass with good coverage
- [ ] Storybook story created
- [ ] No accessibility violations
- [ ] Documentation added

## 💡 Tips

1. **Use Existing Patterns**: Look at the Button component for reference
2. **Leverage Radix UI**: Use Radix primitives for complex interactive components
3. **Test Accessibility**: Always run `axe` tests
4. **Document Variants**: Show all variants in Storybook
5. **Keep it Simple**: Start with basic functionality, add features incrementally
6. **TypeScript First**: Define types before implementation

## ⚡ Common Tasks

### Add a New Token
```tsx
// src/tokens/colors.ts
export const brandColors = {
  // ... existing colors
  newColor: 'rgb(r g b)',
}
```

### Add a New Utility
```tsx
// src/utils/format.ts
export function formatNewThing(value: string): string {
  // implementation
}

// src/utils/index.ts
export * from './format'
```

### Add a New Hook
```tsx
// src/hooks/useNewHook.ts
export function useNewHook() {
  // implementation
}

// src/hooks/index.ts
export { useNewHook } from './useNewHook'
```

---

**Happy coding!** 🎨
