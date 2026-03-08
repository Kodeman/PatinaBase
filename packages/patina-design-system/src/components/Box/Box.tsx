import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../utils/cn'

export interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The element or component to render as
   * @default 'div'
   */
  as?: React.ElementType

  /**
   * Use Radix Slot for composition
   */
  asChild?: boolean
}

/**
 * Box is a polymorphic container component that serves as the foundation
 * for building layouts and other components.
 *
 * @example
 * ```tsx
 * // Render as div (default)
 * <Box className="p-4 bg-gray-100">Content</Box>
 *
 * // Render as different element
 * <Box as="section" className="container mx-auto">
 *   Section content
 * </Box>
 *
 * // Use with asChild for composition
 * <Box asChild>
 *   <Link href="/home">Navigate</Link>
 * </Box>
 * ```
 */
const Box = React.forwardRef<HTMLDivElement, BoxProps>(
  ({ as, asChild, className, children, ...props }, ref) => {
    const Component = asChild ? Slot : (as || 'div')

    return (
      <Component ref={ref} className={cn(className)} {...props}>
        {children}
      </Component>
    )
  }
)

Box.displayName = 'Box'

export { Box }
