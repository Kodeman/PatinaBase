import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const centerVariants = cva('flex items-center justify-center', {
  variants: {
    inline: {
      true: 'inline-flex',
      false: 'flex',
    },
  },
  defaultVariants: {
    inline: false,
  },
})

export interface CenterProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof centerVariants> {
  /**
   * Render as a different HTML element
   */
  as?: React.ElementType
}

/**
 * Center component for centering content both horizontally and vertically
 *
 * @example
 * ```tsx
 * // Center content in a container
 * <Center className="h-screen">
 *   <Card>Centered Card</Card>
 * </Center>
 *
 * // Inline centering
 * <Center inline className="w-20 h-20">
 *   <Icon />
 * </Center>
 * ```
 */
const Center = React.forwardRef<HTMLDivElement, CenterProps>(
  ({ className, inline, as: Component = 'div', ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn(centerVariants({ inline, className }))}
        {...props}
      />
    )
  }
)

Center.displayName = 'Center'

export { Center, centerVariants }
