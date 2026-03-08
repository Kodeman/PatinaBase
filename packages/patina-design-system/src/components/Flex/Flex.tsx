import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const flexVariants = cva('flex', {
  variants: {
    direction: {
      row: 'flex-row',
      column: 'flex-col',
      'row-reverse': 'flex-row-reverse',
      'column-reverse': 'flex-col-reverse',
    },
    wrap: {
      true: 'flex-wrap',
      false: 'flex-nowrap',
      reverse: 'flex-wrap-reverse',
    },
    gap: {
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
  },
  defaultVariants: {
    direction: 'row',
    wrap: false,
    gap: 'md',
    align: 'stretch',
    justify: 'start',
  },
})

export interface FlexProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof flexVariants> {
  /**
   * Render as a different HTML element
   */
  as?: React.ElementType

  /**
   * Use Radix Slot for composition
   */
  asChild?: boolean
}

/**
 * Flex component for creating flexible layouts with flexbox
 *
 * @example
 * ```tsx
 * // Horizontal layout with centered items
 * <Flex align="center" justify="between">
 *   <div>Left</div>
 *   <div>Right</div>
 * </Flex>
 *
 * // Vertical layout with spacing
 * <Flex direction="column" gap="lg">
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 *   <div>Item 3</div>
 * </Flex>
 *
 * // Wrapping layout
 * <Flex wrap={true} gap="md">
 *   {tags.map(tag => <Badge key={tag}>{tag}</Badge>)}
 * </Flex>
 * ```
 */
const Flex = React.forwardRef<HTMLDivElement, FlexProps>(
  (
    {
      className,
      direction,
      wrap,
      gap,
      align,
      justify,
      as,
      asChild,
      ...props
    },
    ref
  ) => {
    const Component = asChild ? Slot : (as || 'div')

    return (
      <Component
        ref={ref}
        className={cn(flexVariants({ direction, wrap, gap, align, justify, className }))}
        {...props}
      />
    )
  }
)

Flex.displayName = 'Flex'

export { Flex, flexVariants }
