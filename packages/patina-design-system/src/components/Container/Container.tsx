import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const containerVariants = cva('mx-auto px-4 sm:px-6', {
  variants: {
    size: {
      sm: 'max-w-screen-sm',
      md: 'max-w-screen-md',
      lg: 'max-w-screen-lg',
      xl: 'max-w-screen-xl',
      '2xl': 'max-w-screen-2xl',
      full: 'max-w-full',
    },
    centered: {
      true: 'mx-auto',
      false: '',
    },
  },
  defaultVariants: {
    size: 'xl',
    centered: true,
  },
})

export interface ContainerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {
  /**
   * Render as a different HTML element
   */
  as?: React.ElementType
}

/**
 * Container component for constraining content width and centering
 *
 * @example
 * ```tsx
 * <Container size="lg">
 *   <h1>Page Title</h1>
 *   <p>Content goes here</p>
 * </Container>
 * ```
 */
const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size, centered, as: Component = 'div', ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn(containerVariants({ size, centered, className }))}
        {...props}
      />
    )
  }
)

Container.displayName = 'Container'

export { Container, containerVariants }
