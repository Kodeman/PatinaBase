import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const spacerVariants = cva('', {
  variants: {
    size: {
      xs: '',
      sm: '',
      md: '',
      lg: '',
      xl: '',
      '2xl': '',
    },
    axis: {
      horizontal: 'inline-block',
      vertical: 'block',
    },
  },
  defaultVariants: {
    size: 'md',
    axis: 'vertical',
  },
})

export interface SpacerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spacerVariants> {
  /**
   * Render as a different HTML element
   */
  as?: React.ElementType
}

/**
 * Spacer component for adding flexible spacing between elements
 *
 * @example
 * ```tsx
 * // Vertical spacing
 * <div>
 *   <Text>First paragraph</Text>
 *   <Spacer size="lg" />
 *   <Text>Second paragraph</Text>
 * </div>
 *
 * // Horizontal spacing
 * <Flex>
 *   <Button>Cancel</Button>
 *   <Spacer axis="horizontal" size="md" />
 *   <Button>Submit</Button>
 * </Flex>
 * ```
 */
const Spacer = React.forwardRef<HTMLDivElement, SpacerProps>(
  ({ className, size, axis, as: Component = 'div', style, ...props }, ref) => {
    const sizeMap = {
      xs: '0.25rem', // 4px
      sm: '0.5rem', // 8px
      md: '1rem', // 16px
      lg: '1.5rem', // 24px
      xl: '2rem', // 32px
      '2xl': '3rem', // 48px
    }

    const spacing = size ? sizeMap[size] : sizeMap.md

    const spacerStyles: React.CSSProperties = {
      ...style,
      [axis === 'horizontal' ? 'width' : 'height']: spacing,
      flexShrink: 0,
    }

    return (
      <Component
        ref={ref}
        className={cn(spacerVariants({ size, axis, className }))}
        style={spacerStyles}
        aria-hidden="true"
        {...props}
      />
    )
  }
)

Spacer.displayName = 'Spacer'

export { Spacer, spacerVariants }
