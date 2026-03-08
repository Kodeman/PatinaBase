import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const stackVariants = cva('flex', {
  variants: {
    direction: {
      row: 'flex-row',
      column: 'flex-col',
      'row-reverse': 'flex-row-reverse',
      'column-reverse': 'flex-col-reverse',
    },
    spacing: {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
      '2xl': 'gap-12',
    },
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
      baseline: 'items-baseline',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
      evenly: 'justify-evenly',
    },
    wrap: {
      true: 'flex-wrap',
      false: 'flex-nowrap',
    },
  },
  defaultVariants: {
    direction: 'column',
    spacing: 'md',
    align: 'stretch',
    justify: 'start',
    wrap: false,
  },
})

export interface StackProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stackVariants> {
  /**
   * Render as a different HTML element
   */
  as?: React.ElementType
}

/**
 * Stack component for laying out children with consistent spacing
 *
 * @example
 * ```tsx
 * // Vertical stack (default)
 * <Stack spacing="md">
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 * </Stack>
 *
 * // Horizontal stack
 * <Stack direction="row" spacing="sm" align="center">
 *   <Button>Cancel</Button>
 *   <Button>Submit</Button>
 * </Stack>
 * ```
 */
const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  (
    {
      className,
      direction,
      spacing,
      align,
      justify,
      wrap,
      as: Component = 'div',
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref}
        className={cn(stackVariants({ direction, spacing, align, justify, wrap, className }))}
        {...props}
      />
    )
  }
)

Stack.displayName = 'Stack'

/**
 * Vertical stack shorthand (VStack)
 */
const VStack = React.forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => {
    return <Stack ref={ref} direction="column" {...props} />
  }
)

VStack.displayName = 'VStack'

/**
 * Horizontal stack shorthand (HStack)
 */
const HStack = React.forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => {
    return <Stack ref={ref} direction="row" {...props} />
  }
)

HStack.displayName = 'HStack'

export { Stack, VStack, HStack, stackVariants }
